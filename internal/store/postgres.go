package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
	"jogos-escolares/internal/domain"
)

var ErrNotFound = errors.New("registro não encontrado")
var ErrProtected = errors.New("resultado finalizado está protegido")
var ErrUnauthorized = errors.New("credenciais inválidas")

type Store struct {
	DB         *sql.DB
	tokenUsers sync.Map
}

func Open(ctx context.Context, url string) (*Store, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	var pingErr error
	for attempt := 1; attempt <= 30; attempt++ {
		pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		pingErr = db.PingContext(pingCtx)
		cancel()
		if pingErr == nil {
			break
		}
		if attempt < 30 {
			time.Sleep(2 * time.Second)
		}
	}
	if pingErr != nil {
		_ = db.Close()
		return nil, pingErr
	}
	s := &Store{DB: db}
	if err = s.initialize(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err = s.loadActiveTokens(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) loadActiveTokens(ctx context.Context) error {
	rows, err := s.DB.QueryContext(ctx, `SELECT token_hash,user_id FROM access_tokens WHERE expires_at>now()`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var tokenHash, userID string
		if err := rows.Scan(&tokenHash, &userID); err != nil {
			return err
		}
		s.tokenUsers.Store(tokenHash, userID)
	}
	return rows.Err()
}
func (s *Store) initialize(ctx context.Context) error {
	statements := []string{
		`CREATE EXTENSION IF NOT EXISTS pgcrypto`,
		`CREATE TABLE IF NOT EXISTS periods (id text PRIMARY KEY, name text NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS competition_days (id text PRIMARY KEY, name text NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS courts (id text PRIMARY KEY, name text NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS sports (id text PRIMARY KEY, name text NOT NULL, type text NOT NULL, court_id text NOT NULL REFERENCES courts(id), start_time time NOT NULL, active boolean NOT NULL DEFAULT true)`,
		`CREATE TABLE IF NOT EXISTS stations (id text PRIMARY KEY, court_id text NOT NULL REFERENCES courts(id), sport_id text NOT NULL REFERENCES sports(id), gender text NOT NULL, name text NOT NULL, sort_order integer NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS teams (id text PRIMARY KEY, period_id text NOT NULL REFERENCES periods(id), color text NOT NULL, hex text NOT NULL, mascot text NOT NULL, sprite text NOT NULL, active boolean NOT NULL DEFAULT true)`,
		`CREATE TABLE IF NOT EXISTS matches (id text PRIMARY KEY, period_id text NOT NULL REFERENCES periods(id), day_id text NOT NULL REFERENCES competition_days(id), court_id text NOT NULL REFERENCES courts(id), scheduled_time time NOT NULL, sport_id text NOT NULL REFERENCES sports(id), gender text NOT NULL, team_a_id text NOT NULL REFERENCES teams(id), team_b_id text NOT NULL REFERENCES teams(id), status text NOT NULL, sort_order integer NOT NULL, score_a integer NOT NULL DEFAULT 0 CHECK (score_a >= 0), score_b integer NOT NULL DEFAULT 0 CHECK (score_b >= 0), updated_at timestamptz)`,
		`CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'ADMIN', active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS audit_logs (id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), action text NOT NULL, match_id text NOT NULL REFERENCES matches(id), before_state jsonb NOT NULL, after_state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS access_tokens (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS result_reset_backups (id bigserial PRIMARY KEY, reset_at timestamptz NOT NULL DEFAULT now(), user_id uuid NOT NULL REFERENCES users(id), match_count integer NOT NULL, matches jsonb NOT NULL)`,
	}
	for _, statement := range statements {
		if _, err := s.DB.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	if err := s.seedReferenceData(ctx); err != nil {
		return err
	}
	if err := s.ensureAdmin(ctx); err != nil {
		return err
	}
	if err := s.seedMatches(ctx); err != nil {
		return err
	}
	if err := s.syncScheduleOnce(ctx); err != nil {
		return err
	}
	return s.resetResultsOnce(ctx)
}

// syncScheduleOnce applies a newly published schedule to the persistent
// database without changing it again on later restarts. The schedule file is
// the source of truth for the one-time maintenance update, and all matches
// return to their published waiting state with zero scores.
func (s *Store) syncScheduleOnce(ctx context.Context) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS maintenance_tasks (
			name text PRIMARY KEY,
			completed_at timestamptz NOT NULL DEFAULT now()
		)
	`); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
		INSERT INTO maintenance_tasks(name)
		VALUES('sync_schedule_sem_pausas_20260921')
		ON CONFLICT DO NOTHING
	`)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 0 {
		return err
	}

	for _, m := range domain.SeedMatches() {
		if _, err = tx.ExecContext(ctx, `
			UPDATE matches
			SET period_id=$2, day_id=$3, court_id=$4, scheduled_time=$5,
				sport_id=$6, gender=$7, team_a_id=$8, team_b_id=$9,
				status=$10, sort_order=$11, score_a=$12, score_b=$13, updated_at=NULL
			WHERE id=$1
		`, m.ID, m.Period, m.Day, m.Court, m.Time, m.SportID, m.Gender,
			m.TeamAID, m.TeamBID, m.Status, m.Order, m.ScoreA, m.ScoreB); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// resetResultsOnce clears the results that were generated before the
// championship started. The marker and update commit together so a restart
// never clears scores entered after this maintenance task has run.
func (s *Store) resetResultsOnce(ctx context.Context) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS maintenance_tasks (
			name text PRIMARY KEY,
			completed_at timestamptz NOT NULL DEFAULT now()
		)
	`); err != nil {
		return err
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO maintenance_tasks(name)
		VALUES('reset_all_results_20260921')
		ON CONFLICT DO NOTHING
	`)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted == 1 {
		if _, err = tx.ExecContext(ctx, `
			UPDATE matches
			SET status = $1, score_a = 0, score_b = 0, updated_at = NULL
		`, domain.StatusAguardando); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) seedReferenceData(ctx context.Context) error {
	for _, item := range domain.Periods {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO periods(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING`, item.ID, item.Name); err != nil {
			return err
		}
	}
	for _, item := range domain.Days {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO competition_days(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING`, item.ID, item.Name); err != nil {
			return err
		}
	}
	for _, item := range domain.Courts {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO courts(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING`, item.ID, item.Name); err != nil {
			return err
		}
	}
	for _, item := range domain.Sports {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO sports(id,name,type,court_id,start_time,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, item.ID, item.Name, item.Type, item.CourtID, item.StartTime, item.Active); err != nil {
			return err
		}
	}
	for _, item := range domain.Stations {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO stations(id,court_id,sport_id,gender,name,sort_order) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, item.ID, item.CourtID, item.SportID, item.Gender, item.Name, item.Order); err != nil {
			return err
		}
	}
	for _, item := range domain.SeedTeams() {
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO teams(id,period_id,color,hex,mascot,sprite,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET period_id=EXCLUDED.period_id,color=EXCLUDED.color,hex=EXCLUDED.hex,mascot=EXCLUDED.mascot,sprite=EXCLUDED.sprite,active=EXCLUDED.active`, item.ID, item.Period, item.Color, item.Hex, item.Mascot, item.Sprite, item.Active); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) seedMatches(ctx context.Context) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, m := range domain.SeedMatches() {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO matches(
				id,period_id,day_id,court_id,scheduled_time,sport_id,gender,
				team_a_id,team_b_id,status,sort_order,score_a,score_b
			)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			ON CONFLICT(id) DO NOTHING
		`, m.ID, m.Period, m.Day, m.Court, m.Time, m.SportID, m.Gender, m.TeamAID, m.TeamBID, m.Status, m.Order, m.ScoreA, m.ScoreB); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ensureAdmin(ctx context.Context) error {
	fixedUsers := []struct {
		login string
		name  string
		hash  string
	}{
		{"Vinicius Cerezuela", "Vinicius Cerezuela", "$2a$12$3ev/g8YrW6iTu.AwQWfzlO4gh28RhtwdY/EdVke8B6EhLreegaNue"},
		{"Gabriel Capoia", "Gabriel Capoia", "$2a$12$xS8MDi/o62b6DCa.BSAqRermT3V00ILfEOjUrNdSoy8TF61c4NBci"},
		{"Smel", "Smel", "$2a$12$xVvzyagcQxOAVLWLwEkJX.5iEpJ.ZvzSJXTSUHbNeM3XIhGs7HX.."},
	}
	for _, user := range fixedUsers {
		if _, err := s.DB.ExecContext(ctx,
			`INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3)
			 ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, active=true`,
			strings.ToLower(strings.TrimSpace(user.login)), user.name, user.hash,
		); err != nil {
			return err
		}
	}

	email, password := os.Getenv("ADMIN_EMAIL"), os.Getenv("ADMIN_PASSWORD")
	if email == "" || password == "" {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.DB.ExecContext(ctx,
		`INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3)
		 ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, active=true`,
		strings.ToLower(strings.TrimSpace(email)), "Administrador", string(hash),
	)
	return err
}

func (s *Store) Teams(ctx context.Context, period string) ([]domain.Team, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id,period_id,color,hex,mascot,sprite,active FROM teams WHERE ($1='' OR period_id=$1) AND active ORDER BY id`, period)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Team{}
	for rows.Next() {
		var t domain.Team
		if err := rows.Scan(&t.ID, &t.Period, &t.Color, &t.Hex, &t.Mascot, &t.Sprite, &t.Active); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func (s *Store) Matches(ctx context.Context, period, day, court, sport, gender string) ([]domain.Match, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id,period_id,day_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,team_a_id,team_b_id,status,sort_order,score_a,score_b FROM matches WHERE ($1='' OR period_id=$1) AND ($2='' OR day_id=$2) AND ($3='' OR court_id=$3) AND ($4='' OR sport_id=$4) AND ($5='' OR gender=$5) ORDER BY day_id,court_id,scheduled_time,sort_order`, period, day, court, sport, gender)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Match{}
	for rows.Next() {
		var m domain.Match
		if err := rows.Scan(&m.ID, &m.Period, &m.Day, &m.Court, &m.Time, &m.SportID, &m.Gender, &m.TeamAID, &m.TeamBID, &m.Status, &m.Order, &m.ScoreA, &m.ScoreB); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) Login(ctx context.Context, email, password string) (string, error) {
	login := strings.ToLower(strings.TrimSpace(email))
	fixed := map[string]string{
		"vinicius cerezuela": "99c90ab6c33c1f3b0674dba8da7674ce96139162d1c9d16c376de365dcda4a27",
		"gabriel capoia":      "1ce1e488e98e66b63fa8e2266aef8a1f06ab4d0a00fab329174e95f1d31435fe",
		"smel":                "e42e62ee56f9065356e413c3402d7b7c95b71a038368a03224f84f5e6842707c",
	}
	if expected, ok := fixed[login]; ok {
		sum := sha256.Sum256([]byte(password))
		if hex.EncodeToString(sum[:]) != expected {
			return "", ErrUnauthorized
		}
		var id string
		if err := s.DB.QueryRowContext(ctx, `SELECT id FROM users WHERE email=$1 AND active`, login).Scan(&id); err != nil {
			return "", ErrUnauthorized
		}
		return s.issueToken(ctx, id)
	}

	var id, hash string
	err := s.DB.QueryRowContext(ctx, `SELECT id,password_hash FROM users WHERE email=$1 AND active`, login).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return "", ErrUnauthorized
	}
	return s.issueToken(ctx, id)
}

func (s *Store) issueToken(ctx context.Context, id string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	_, err := s.DB.ExecContext(ctx, `INSERT INTO access_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, hex.EncodeToString(sum[:]), id, time.Now().Add(12*time.Hour))
	if err == nil {
		s.tokenUsers.Store(hex.EncodeToString(sum[:]), id)
	}
	return token, err
}

func (s *Store) UserID(ctx context.Context, token string) (string, error) {
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])
	if cached, ok := s.tokenUsers.Load(tokenHash); ok {
		if id, ok := cached.(string); ok && id != "" {
			return id, nil
		}
	}
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT user_id FROM access_tokens WHERE token_hash=$1 AND expires_at>now()`, tokenHash).Scan(&id)
	if err != nil {
		return "", ErrUnauthorized
	}
	s.tokenUsers.Store(tokenHash, id)
	return id, nil
}
func (s *Store) SaveResult(ctx context.Context, id string, a, b int, user string, correction bool) (domain.Match, error) {
	if a < 0 || b < 0 {
		return domain.Match{}, errors.New("placar inválido")
	}
	action := "SALVAR_RESULTADO"
	if correction {
		action = "ALTERAR_RESULTADO"
	}
	var m domain.Match
	err := s.DB.QueryRowContext(ctx, `
		WITH old AS (
			SELECT id, period_id, day_id, court_id, scheduled_time, sport_id, gender,
			       team_a_id, team_b_id, status, sort_order, score_a, score_b
			  FROM matches
			 WHERE id = $4
			   AND (status <> $5 OR $6)
		),
		updated AS (
			UPDATE matches m
			   SET score_a=$1, score_b=$2, status=$5, updated_at=now()
			  FROM old
			 WHERE m.id=old.id
			RETURNING m.id,m.period_id,m.day_id,m.court_id,m.scheduled_time,m.sport_id,m.gender,
			          m.team_a_id,m.team_b_id,m.status,m.sort_order,m.score_a,m.score_b
		),
		logged AS (
			INSERT INTO audit_logs(user_id,action,match_id,before_state,after_state)
			SELECT $3,$7,old.id,
			       jsonb_build_object(
			         'id',old.id,'period',old.period_id,'day',old.day_id,'court',old.court_id,
			         'sportId',old.sport_id,'gender',old.gender,'teamAId',old.team_a_id,'teamBId',old.team_b_id,
			         'status',old.status,'order',old.sort_order,'scoreA',old.score_a,'scoreB',old.score_b
			       ),
			       jsonb_build_object(
			         'id',updated.id,'period',updated.period_id,'day',updated.day_id,'court',updated.court_id,
			         'sportId',updated.sport_id,'gender',updated.gender,'teamAId',updated.team_a_id,'teamBId',updated.team_b_id,
			         'status',updated.status,'order',updated.sort_order,'scoreA',updated.score_a,'scoreB',updated.score_b
			       )
			  FROM old JOIN updated ON updated.id=old.id
		)
		SELECT id,period_id,day_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,
		       team_a_id,team_b_id,status,sort_order,score_a,score_b
		  FROM updated
	`, a,b,user,id,domain.StatusFinalizado,correction,action).Scan(
		&m.ID,&m.Period,&m.Day,&m.Court,&m.Time,&m.SportID,&m.Gender,
		&m.TeamAID,&m.TeamBID,&m.Status,&m.Order,&m.ScoreA,&m.ScoreB,
	)
	if err == sql.ErrNoRows {
		return domain.Match{}, ErrProtected
	}
	if err != nil {
		return domain.Match{}, err
	}
	return m, nil
}

func (s *Store) AdvanceMatch(ctx context.Context, id string, user string) (domain.Match, error) {
	var m domain.Match
	err := s.DB.QueryRowContext(ctx, `
		WITH old AS (
			SELECT id, period_id, day_id, court_id, scheduled_time, sport_id, gender,
			       team_a_id, team_b_id, status, sort_order, score_a, score_b
			  FROM matches
			 WHERE id = $2
			   AND status = $3
		),
		updated AS (
			UPDATE matches m
			   SET status = $1, updated_at = now()
			  FROM old
			 WHERE m.id = old.id
			RETURNING m.id,m.period_id,m.day_id,m.court_id,m.scheduled_time,m.sport_id,m.gender,
			          m.team_a_id,m.team_b_id,m.status,m.sort_order,m.score_a,m.score_b
		),
		logged AS (
			INSERT INTO audit_logs(user_id,action,match_id,before_state,after_state)
			SELECT $4,'ADIANTAR_PARTIDA',old.id,
			       jsonb_build_object(
			         'id',old.id,'period',old.period_id,'day',old.day_id,'court',old.court_id,
			         'sportId',old.sport_id,'gender',old.gender,'teamAId',old.team_a_id,'teamBId',old.team_b_id,
			         'status',old.status,'order',old.sort_order,'scoreA',old.score_a,'scoreB',old.score_b
			       ),
			       jsonb_build_object(
			         'id',updated.id,'period',updated.period_id,'day',updated.day_id,'court',updated.court_id,
			         'sportId',updated.sport_id,'gender',updated.gender,'teamAId',updated.team_a_id,'teamBId',updated.team_b_id,
			         'status',updated.status,'order',updated.sort_order,'scoreA',updated.score_a,'scoreB',updated.score_b
			       )
			  FROM old JOIN updated ON updated.id=old.id
		)
		SELECT id,period_id,day_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,
		       team_a_id,team_b_id,status,sort_order,score_a,score_b
		  FROM updated
	`, domain.StatusEmAndamento, id, domain.StatusAguardando, user).Scan(
		&m.ID,&m.Period,&m.Day,&m.Court,&m.Time,&m.SportID,&m.Gender,
		&m.TeamAID,&m.TeamBID,&m.Status,&m.Order,&m.ScoreA,&m.ScoreB,
	)
	if err == sql.ErrNoRows {
		return domain.Match{}, ErrProtected
	}
	if err != nil {
		return domain.Match{}, err
	}
	return m, nil
}

// ResetAllResults stores a complete snapshot before restoring the official
// schedule. The snapshot and restore use one transaction, so every recorded
// backup represents the exact state that was cleared.
func (s *Store) ResetAllResults(ctx context.Context, user string) (int64, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO result_reset_backups(user_id, match_count, matches)
		SELECT $1, COUNT(*)::integer, COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.sort_order), '[]'::jsonb)
		FROM matches m
	`, user); err != nil {
		return 0, err
	}

	for _, m := range domain.SeedMatches() {
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO matches(
				id,period_id,day_id,court_id,scheduled_time,sport_id,gender,
				team_a_id,team_b_id,status,sort_order,score_a,score_b
			)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			ON CONFLICT(id) DO UPDATE SET
				period_id=EXCLUDED.period_id, day_id=EXCLUDED.day_id,
				court_id=EXCLUDED.court_id, scheduled_time=EXCLUDED.scheduled_time,
				sport_id=EXCLUDED.sport_id, gender=EXCLUDED.gender,
				team_a_id=EXCLUDED.team_a_id, team_b_id=EXCLUDED.team_b_id,
				status=EXCLUDED.status, sort_order=EXCLUDED.sort_order,
				score_a=EXCLUDED.score_a, score_b=EXCLUDED.score_b, updated_at=NULL
		`, m.ID, m.Period, m.Day, m.Court, m.Time, m.SportID, m.Gender,
			m.TeamAID, m.TeamBID, m.Status, m.Order, m.ScoreA, m.ScoreB); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return int64(len(domain.SeedMatches())), nil
}
