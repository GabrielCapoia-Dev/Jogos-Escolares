-- Run with psql -v ON_ERROR_STOP=1 -v backup_id=123 -f this-file.sql.
-- Stop/restart the API around a real restoration to refresh its match cache.
-- Refuses snapshots from a different draw; preserves a safety snapshot first.
\set ON_ERROR_STOP on
BEGIN;
LOCK TABLE matches, penalties, finals_confirmations, final_matches IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE restore_source ON COMMIT DROP AS
 SELECT * FROM result_reset_backups WHERE id=:'backup_id'::bigint;
DO $$
BEGIN
 IF (SELECT count(*) FROM restore_source)<>1 THEN RAISE EXCEPTION 'Backup não encontrado'; END IF;
 IF EXISTS (SELECT 1 FROM restore_source WHERE jsonb_array_length(matches)<>match_count OR jsonb_array_length(penalties)<>penalty_count)
 THEN RAISE EXCEPTION 'Backup com contagens inconsistentes'; END IF;
 IF EXISTS (
   SELECT 1 FROM (SELECT o.* FROM restore_source s, jsonb_populate_recordset(NULL::matches,s.matches) o) old
   FULL JOIN matches current ON current.id=old.id
   WHERE current.id IS NULL OR old.id IS NULL OR
     ROW(current.period_id,current.day_id,current.court_id,current.scheduled_time,current.sport_id,current.gender,current.team_a_id,current.team_b_id,current.sort_order)
     IS DISTINCT FROM
     ROW(old.period_id,old.day_id,old.court_id,old.scheduled_time,old.sport_id,old.gender,old.team_a_id,old.team_b_id,old.sort_order)
 ) THEN RAISE EXCEPTION 'O sorteio/horário deste backup difere do cronograma atual. Restauração recusada'; END IF;
END $$;
INSERT INTO result_reset_backups(user_id,match_count,matches,penalty_count,penalties,finals_confirmations,final_matches)
SELECT s.user_id,(SELECT count(*) FROM matches),
 (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM matches m),
 (SELECT count(*) FROM penalties),
 (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]') FROM penalties p),
 (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.period_id),'[]') FROM finals_confirmations f),
 (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id),'[]') FROM final_matches f)
FROM restore_source s;
UPDATE matches m SET status=o.status,score_a=o.score_a,score_b=o.score_b,updated_at=o.updated_at
 FROM restore_source s,jsonb_populate_recordset(NULL::matches,s.matches) o WHERE m.id=o.id;
DELETE FROM finals_confirmations;
DELETE FROM final_matches;
DELETE FROM penalties;
INSERT INTO penalties SELECT o.* FROM restore_source s,jsonb_populate_recordset(NULL::penalties,s.penalties) o;
INSERT INTO finals_confirmations
 SELECT o.* FROM restore_source s,jsonb_array_elements(s.finals_confirmations) e,
 jsonb_populate_record(NULL::finals_confirmations,jsonb_build_object('needs_review',false)||e) o;
INSERT INTO final_matches SELECT o.* FROM restore_source s,jsonb_populate_recordset(NULL::final_matches,s.final_matches) o;
SELECT setval(pg_get_serial_sequence('penalties','id'),
 greatest((SELECT last_value FROM penalties_id_seq),coalesce((SELECT max(id) FROM penalties),1)),true);
COMMIT;
