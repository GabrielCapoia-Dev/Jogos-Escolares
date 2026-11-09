package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"jogos-escolares/internal/domain"
)

func (s *Store) FinalistConfirmation(ctx context.Context, period string) ([]string, bool, error) {
	var a, b, c string
	var review bool
	err := s.DB.QueryRowContext(ctx, `SELECT team_a_id,team_b_id,team_c_id,needs_review FROM finals_confirmations WHERE period_id=$1`, period).Scan(&a, &b, &c, &review)
	if err == sql.ErrNoRows {
		return []string{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return []string{a, b, c}, review, nil
}

// Reconfirming the same three teams preserves their final draw and scores.
// A different selection archives the old final games before creating new ones.
func (s *Store) confirmFinalistsWithMatches(ctx context.Context, period string, ids []string, user string) error {
	if len(ids) != 3 {
		return errors.New("selecione exatamente três equipes")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "finals:"+period); err != nil {
		return err
	}
	previous := make([]string, 3)
	err = tx.QueryRowContext(ctx, `SELECT team_a_id,team_b_id,team_c_id FROM finals_confirmations WHERE period_id=$1 FOR UPDATE`, period).Scan(&previous[0], &previous[1], &previous[2])
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	same := err == nil
	selected := map[string]bool{}
	for _, id := range ids {
		selected[id] = true
	}
	if len(selected) != 3 {
		return errors.New("selecione equipes diferentes")
	}
	for _, id := range previous {
		same = same && selected[id]
	}
	if same {
		ids = previous
	} else {
		if _, err = tx.ExecContext(ctx, `INSERT INTO final_draw_backups(period_id,user_id,matches)
			SELECT $1,$2,jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM final_matches m WHERE period_id=$1 HAVING count(*)>0`, period, user); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `DELETE FROM final_matches WHERE period_id=$1`, period); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO finals_confirmations(period_id,team_a_id,team_b_id,team_c_id,confirmed_by,confirmed_at,needs_review)
		VALUES($1,$2,$3,$4,$5,now(),false) ON CONFLICT(period_id) DO UPDATE SET
		team_a_id=EXCLUDED.team_a_id,team_b_id=EXCLUDED.team_b_id,team_c_id=EXCLUDED.team_c_id,
		confirmed_by=EXCLUDED.confirmed_by,confirmed_at=now(),needs_review=false`, period, ids[0], ids[1], ids[2], user); err != nil {
		return err
	}
	for _, m := range domain.SeedFinalMatches(period, ids) {
		if _, err = tx.ExecContext(ctx, `INSERT INTO final_matches(id,period_id,court_id,scheduled_time,sport_id,gender,team_a_id,team_b_id,status,sort_order,score_a,score_b)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0) ON CONFLICT(id) DO NOTHING`,
			m.ID, m.Period, m.Court, m.Time, m.SportID, m.Gender, m.TeamAID, m.TeamBID, m.Status, m.Order); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) FinalMatches(ctx context.Context, period string) ([]domain.Match, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT id,period_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,
		team_a_id,team_b_id,status,sort_order,score_a,score_b FROM final_matches WHERE period_id=$1 ORDER BY scheduled_time,sort_order,gender`, period)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Match{}
	for rows.Next() {
		m := domain.Match{Day: domain.FinalDay}
		if err := rows.Scan(&m.ID, &m.Period, &m.Court, &m.Time, &m.SportID, &m.Gender, &m.TeamAID, &m.TeamBID, &m.Status, &m.Order, &m.ScoreA, &m.ScoreB); err != nil {
			return nil, err
		}
		items = append(items, m)
	}
	return items, rows.Err()
}

func (s *Store) SaveFinalResult(ctx context.Context, id string, a, b int, user string, correction bool) (domain.Match, error) {
	if a < 0 || b < 0 {
		return domain.Match{}, errors.New("placar inválido")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return domain.Match{}, err
	}
	defer tx.Rollback()
	before := domain.Match{Day: domain.FinalDay}
	err = tx.QueryRowContext(ctx, `SELECT m.id,m.period_id,m.court_id,to_char(m.scheduled_time,'HH24:MI'),m.sport_id,m.gender,
		m.team_a_id,m.team_b_id,m.status,m.sort_order,m.score_a,m.score_b
		FROM final_matches m JOIN finals_confirmations f ON f.period_id=m.period_id
		WHERE m.id=$1 AND NOT f.needs_review FOR UPDATE OF m,f`, id).Scan(
		&before.ID, &before.Period, &before.Court, &before.Time, &before.SportID, &before.Gender,
		&before.TeamAID, &before.TeamBID, &before.Status, &before.Order, &before.ScoreA, &before.ScoreB)
	if err == sql.ErrNoRows || (err == nil && before.Status == domain.StatusFinalizado && !correction) {
		return domain.Match{}, ErrProtected
	}
	if err != nil {
		return domain.Match{}, err
	}
	after := before
	after.ScoreA, after.ScoreB, after.Status = a, b, domain.StatusFinalizado
	if _, err = tx.ExecContext(ctx, `UPDATE final_matches SET score_a=$2,score_b=$3,status=$4,updated_at=now() WHERE id=$1`, id, a, b, after.Status); err != nil {
		return domain.Match{}, err
	}
	oldJSON, _ := json.Marshal(before)
	newJSON, _ := json.Marshal(after)
	if _, err = tx.ExecContext(ctx, `INSERT INTO final_result_audit(user_id,match_id,before_state,after_state) VALUES($1,$2,$3,$4)`, user, id, string(oldJSON), string(newJSON)); err != nil {
		return domain.Match{}, err
	}
	if err = tx.Commit(); err != nil {
		return domain.Match{}, err
	}
	return after, nil
}
