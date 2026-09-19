package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
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

type Store struct{\n\tDB *sql.DB\n\ttokenUsers sync.Map\n}

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
	return s, nil
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
	return s.seedDemoResults(ctx)
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
		if _, err := s.DB.ExecContext(ctx, `INSERT INTO teams(id,period_id,color,hex,mascot,sprite,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, item.ID, item.Period, item.Color, item.Hex, item.Mascot, item.Sprite, item.Active); err != nil {
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

func (s *Store) seedDemoResults(ctx context.Context) error {
	if strings.ToLower(strings.TrimSpace(os.Getenv("DEMO_RESULTS"))) != "true" {
		return nil
	}

	// Sempre completa a base de teste, mas só toca partidas que ainda não foram
	// alteradas manualmente (updated_at IS NULL). Assim funciona mesmo com banco antigo.
	_, err := s.DB.ExecContext(ctx, `
		UPDATE matches
		   SET status = $1,
		       score_a = CASE sort_order
		                   WHEN 1 THEN 4
		                   WHEN 2 THEN 1
		                   WHEN 3 THEN 2
		                   ELSE score_a
		                 END,
		       score_b = CASE sort_order
		                   WHEN 1 THEN 2
		                   WHEN 2 THEN 3
		                   WHEN 3 THEN 2
		                   ELSE score_b
		                 END,
		       updated_at = now()
		 WHERE sort_order BETWEEN 1 AND 3
		   AND updated_at IS NULL
	`, domain.StatusFinalizado)
	return err
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
	return token, err
}

func (s *Store) UserID(ctx context.Context, token string) (string, error) {
	sum := sha256.Sum256([]byte(token))
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT user_id FROM access_tokens WHERE token_hash=$1 AND expires_at>now()`, hex.EncodeToString(sum[:])).Scan(&id)
	if err != nil {
		return "", ErrUnauthorized
	}
	return id, nil
}
func (s *Store) SaveResult(ctx context.Context, id string, a, b int, user string, correction bool) (domain.Match, error) {
\tif a < 0 || b < 0 {
\t\treturn domain.Match{}, errors.New("placar inválido")
\t}
\taction := "SALVAR_RESULTADO"
\tif correction {
\t\taction = "ALTERAR_RESULTADO"
\t}
\tvar m domain.Match
\terr := s.DB.QueryRowContext(ctx, `
\t\tWITH old AS (
\t\t\tSELECT id, period_id, day_id, court_id, scheduled_time, sport_id, gender,
\t\t\t       team_a_id, team_b_id, status, sort_order, score_a, score_b
\t\t\t  FROM matches
\t\t\t WHERE id = $4
\t\t\t   AND (status <> $5 OR $6)
\t\t),
\t\tupdated AS (
\t\t\tUPDATE matches m
\t\t\t   SET score_a=$1, score_b=$2, status=$5, updated_at=now()
\t\t\t  FROM old
\t\t\t WHERE m.id=old.id
\t\t\tRETURNING m.id,m.period_id,m.day_id,m.court_id,m.scheduled_time,m.sport_id,m.gender,
\t\t\t          m.team_a_id,m.team_b_id,m.status,m.sort_order,m.score_a,m.score_b
\t\t),
\t\tlogged AS (
\t\t\tINSERT INTO audit_logs(user_id,action,match_id,before_state,after_state)
\t\t\tSELECT $3,$7,old.id,
\t\t\t       jsonb_build_object(
\t\t\t         'id',old.id,'period',old.period_id,'day',old.day_id,'court',old.court_id,
\t\t\t         'sportId',old.sport_id,'gender',old.gender,'teamAId',old.team_a_id,'teamBId',old.team_b_id,
\t\t\t         'status',old.status,'order',old.sort_order,'scoreA',old.score_a,'scoreB',old.score_b
\t\t\t       ),
\t\t\t       jsonb_build_object(
\t\t\t         'id',updated.id,'period',updated.period_id,'day',updated.day_id,'court',updated.court_id,
\t\t\t         'sportId',updated.sport_id,'gender',updated.gender,'teamAId',updated.team_a_id,'teamBId',updated.team_b_id,
\t\t\t         'status',updated.status,'order',updated.sort_order,'scoreA',updated.score_a,'scoreB',updated.score_b
\t\t\t       )
\t\t\t  FROM old JOIN updated ON updated.id=old.id
\t\t)
\t\tSELECT id,period_id,day_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,
\t\t       team_a_id,team_b_id,status,sort_order,score_a,score_b
\t\t  FROM updated
\t`, a,b,user,id,domain.StatusFinalizado,correction,action).Scan(
\t\t&m.ID,&m.Period,&m.Day,&m.Court,&m.Time,&m.SportID,&m.Gender,
\t\t&m.TeamAID,&m.TeamBID,&m.Status,&m.Order,&m.ScoreA,&m.ScoreB,
\t)
\tif err == sql.ErrNoRows {
\t\treturn domain.Match{}, ErrProtected
\t}
\tif err != nil {
\t\treturn domain.Match{}, err
\t}
\treturn m, nil
}
