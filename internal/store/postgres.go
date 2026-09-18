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
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
	"jogos-escolares/internal/domain"
)

var ErrNotFound = errors.New("registro não encontrado")
var ErrProtected = errors.New("resultado finalizado está protegido")
var ErrUnauthorized = errors.New("credenciais inválidas")

type Store struct{ DB *sql.DB }

func Open(ctx context.Context, url string) (*Store, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err = db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
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
	return s.seedMatches(ctx)
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
	var count int
	if err := s.DB.QueryRowContext(ctx, "SELECT count(*) FROM matches").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, m := range domain.SeedMatches() {
		if _, err = tx.ExecContext(ctx, `INSERT INTO matches(id,period_id,day_id,court_id,scheduled_time,sport_id,gender,team_a_id,team_b_id,status,sort_order,score_a,score_b) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, m.ID, m.Period, m.Day, m.Court, m.Time, m.SportID, m.Gender, m.TeamAID, m.TeamBID, m.Status, m.Order, m.ScoreA, m.ScoreB); err != nil {
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
		{"Vinicius Cerezuela", "Vinicius Cerezuela", "$2a$12$NZjYTTJfbxa4MHqEXfaAheXJlYmMe8m4KB65bEHgtiZqACvQt2jHq"},
		{"Gabriel Capoia", "Gabriel Capoia", "$2a$12$652SH4tRcU06Nhde3hcVFuwa.ThKL1FHXb6xYab6yKEBqwlneDKX6"},
		{"Smel", "Smel", "$2a$12$tjYSjDXiTFBRTDnIamefBuVs1/LeBKxF5OVz4hV0F5OfHju6w7cj2"},
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
	var id, hash string
	err := s.DB.QueryRowContext(ctx, `SELECT id,password_hash FROM users WHERE email=$1 AND active`, strings.ToLower(strings.TrimSpace(email))).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return "", ErrUnauthorized
	}
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	_, err = s.DB.ExecContext(ctx, `INSERT INTO access_tokens(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, hex.EncodeToString(sum[:]), id, time.Now().Add(12*time.Hour))
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
	if a < 0 || b < 0 {
		return domain.Match{}, errors.New("placar inválido")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return domain.Match{}, err
	}
	defer tx.Rollback()
	var m domain.Match
	err = tx.QueryRowContext(ctx, `SELECT id,period_id,day_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,team_a_id,team_b_id,status,sort_order,score_a,score_b FROM matches WHERE id=$1 FOR UPDATE`, id).Scan(&m.ID, &m.Period, &m.Day, &m.Court, &m.Time, &m.SportID, &m.Gender, &m.TeamAID, &m.TeamBID, &m.Status, &m.Order, &m.ScoreA, &m.ScoreB)
	if err == sql.ErrNoRows {
		return domain.Match{}, ErrNotFound
	}
	if err != nil {
		return domain.Match{}, err
	}
	if m.Status == domain.StatusFinalizado && !correction {
		return domain.Match{}, ErrProtected
	}
	before, _ := json.Marshal(m)
	m.ScoreA = a
	m.ScoreB = b
	m.Status = domain.StatusFinalizado
	_, err = tx.ExecContext(ctx, `UPDATE matches SET score_a=$1,score_b=$2,status=$3,updated_at=now() WHERE id=$4`, a, b, m.Status, id)
	if err != nil {
		return domain.Match{}, err
	}
	after, _ := json.Marshal(m)
	action := "SALVAR_RESULTADO"
	if correction {
		action = "ALTERAR_RESULTADO"
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO audit_logs(user_id,action,match_id,before_state,after_state) VALUES($1,$2,$3,$4,$5)`, user, action, id, before, after); err != nil {
		return domain.Match{}, err
	}
	return m, tx.Commit()
}
