package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"jogos-escolares/internal/domain"
	"strconv"
	"strings"
	"time"
)

func formatID(id int64) string { return strconv.FormatInt(id, 10) }

// Backup downloads contain administrative data; check expiry, role and active
// status directly rather than relying on the ordinary request token cache.
func (s *Store) BackupAdminID(ctx context.Context, token string) (string, error) {
	sum := sha256.Sum256([]byte(token))
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT u.id FROM access_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=$1 AND t.expires_at>now() AND u.active AND u.role='ADMIN'`, hex.EncodeToString(sum[:])).Scan(&id)
	if err != nil {
		return "", ErrUnauthorized
	}
	return id, nil
}

var ErrIncompatibleBackup = errors.New("este backup pertence a outro sorteio ou horário e não pode ser restaurado no cronograma atual")

type ResultSnapshot struct {
	Matches       json.RawMessage `json:"matches"`
	Penalties     json.RawMessage `json:"penalties"`
	Confirmations json.RawMessage `json:"finals_confirmations"`
	Finals        json.RawMessage `json:"final_matches"`
}

type BackupInfo struct {
	Key        string    `json:"key"`
	Kind       string    `json:"kind"`
	CreatedAt  time.Time `json:"createdAt"`
	FileName   string    `json:"fileName"`
	Size       int64     `json:"sizeBytes"`
	MatchCount int       `json:"matchCount"`
	CanRestore bool      `json:"canRestore"`
	Reason     string    `json:"reason,omitempty"`
}

const compatibleSnapshot = `NOT EXISTS (
 SELECT 1 FROM (SELECT o.* FROM jsonb_populate_recordset(NULL::matches,$1::jsonb) o) old
 FULL JOIN matches current ON current.id=old.id
 WHERE current.id IS NULL OR old.id IS NULL OR
 ROW(current.period_id,current.day_id,current.court_id,current.scheduled_time,current.sport_id,current.gender,current.team_a_id,current.team_b_id,current.sort_order)
 IS DISTINCT FROM
 ROW(old.period_id,old.day_id,old.court_id,old.scheduled_time,old.sport_id,old.gender,old.team_a_id,old.team_b_id,old.sort_order))
 AND (SELECT count(*)=count(DISTINCT e->>'id') FROM jsonb_array_elements($1::jsonb) e)`

func (s *Store) ListResultBackups(ctx context.Context) ([]BackupInfo, error) {
	compatibility := strings.ReplaceAll(compatibleSnapshot, "$1", "b.matches")
	rows, err := s.DB.QueryContext(ctx, `SELECT b.id,b.reset_at,b.backup_kind,b.match_count,(`+compatibility+`) FROM result_reset_backups b ORDER BY b.reset_at DESC,b.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []BackupInfo{}
	for rows.Next() {
		var id int64
		var b BackupInfo
		if err = rows.Scan(&id, &b.CreatedAt, &b.Kind, &b.MatchCount, &b.CanRestore); err != nil {
			return nil, err
		}
		b.Key = "db/" + formatID(id)
		b.FileName = "resultados-backup-" + formatID(id) + ".json"
		if !b.CanRestore {
			b.Reason = ErrIncompatibleBackup.Error()
		}
		result = append(result, b)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Store) ResultBackup(ctx context.Context, id int64) (ResultSnapshot, error) {
	var b ResultSnapshot
	err := s.DB.QueryRowContext(ctx, `SELECT matches,penalties,finals_confirmations,final_matches FROM result_reset_backups WHERE id=$1`, id).Scan(&b.Matches, &b.Penalties, &b.Confirmations, &b.Finals)
	if err == sql.ErrNoRows {
		return b, ErrNotFound
	}
	return b, err
}

type RestoreResult struct {
	SafetyBackupID int64          `json:"safetyBackupId"`
	Matches        []domain.Match `json:"-"`
}

func (s *Store) RestoreResults(ctx context.Context, b ResultSnapshot, user, source string) (RestoreResult, error) {
	var result RestoreResult
	for _, raw := range []json.RawMessage{b.Matches, b.Penalties, b.Confirmations, b.Finals} {
		var a []json.RawMessage
		if json.Unmarshal(raw, &a) != nil || a == nil {
			return result, errors.New("backup inválido")
		}
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return result, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `LOCK TABLE matches,penalties,finals_confirmations,final_matches IN ACCESS EXCLUSIVE MODE`); err != nil {
		return result, err
	}
	var compatible bool
	if err = tx.QueryRowContext(ctx, "SELECT "+compatibleSnapshot, string(b.Matches)).Scan(&compatible); err != nil {
		return result, err
	}
	if !compatible {
		return result, ErrIncompatibleBackup
	}
	if err = tx.QueryRowContext(ctx, `INSERT INTO result_reset_backups(user_id,match_count,matches,penalty_count,penalties,finals_confirmations,final_matches,backup_kind)
 SELECT $1,(SELECT count(*) FROM matches),(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM matches m),
 (SELECT count(*) FROM penalties),(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM penalties p),
 (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.period_id),'[]') FROM finals_confirmations f),
 (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id),'[]') FROM final_matches f),'BEFORE_RESTORE' RETURNING id`, user).Scan(&result.SafetyBackupID); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE matches m SET status=o.status,score_a=o.score_a,score_b=o.score_b,updated_at=o.updated_at
 FROM jsonb_populate_recordset(NULL::matches,$1::jsonb) o WHERE m.id=o.id`, string(b.Matches)); err != nil {
		return result, err
	}
	for _, table := range []string{"finals_confirmations", "final_matches", "penalties"} {
		if _, err = tx.ExecContext(ctx, "DELETE FROM "+table); err != nil {
			return result, err
		}
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO penalties SELECT o.* FROM jsonb_populate_recordset(NULL::penalties,$1::jsonb) o`, string(b.Penalties)); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO finals_confirmations SELECT o.* FROM jsonb_array_elements($1::jsonb) e,
 jsonb_populate_record(NULL::finals_confirmations,jsonb_build_object('needs_review',false)||e) o`, string(b.Confirmations)); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO final_matches SELECT o.* FROM jsonb_populate_recordset(NULL::final_matches,$1::jsonb) o`, string(b.Finals)); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `SELECT setval(pg_get_serial_sequence('penalties','id'),greatest((SELECT last_value FROM penalties_id_seq),coalesce((SELECT max(id) FROM penalties),1)),true)`); err != nil {
		return result, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO backup_restore_audit(user_id,source,safety_backup_id) VALUES($1,$2,$3)`, user, source, result.SafetyBackupID); err != nil {
		return result, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id,period_id,day_id,court_id,to_char(scheduled_time,'HH24:MI'),sport_id,gender,team_a_id,team_b_id,status,sort_order,score_a,score_b FROM matches ORDER BY day_id,court_id,scheduled_time,sort_order`)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var m domain.Match
		if err = rows.Scan(&m.ID, &m.Period, &m.Day, &m.Court, &m.Time, &m.SportID, &m.Gender, &m.TeamAID, &m.TeamBID, &m.Status, &m.Order, &m.ScoreA, &m.ScoreB); err != nil {
			rows.Close()
			return result, err
		}
		result.Matches = append(result.Matches, m)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	if err = tx.Commit(); err != nil {
		return result, err
	}
	return result, nil
}
