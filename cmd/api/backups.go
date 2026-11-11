package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"jogos-escolares/internal/store"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var dailyName = regexp.MustCompile(`^jogos-escolares-[0-9]{8}T[0-9]{6}Z\.dump$`)

func backupDirectory() string {
	if dir := os.Getenv("BACKUP_DIR"); dir != "" {
		return dir
	}
	return "/backups"
}

func dailyFile(name string) (string, os.FileInfo, error) {
	if !dailyName.MatchString(name) {
		return "", nil, store.ErrNotFound
	}
	path := filepath.Join(backupDirectory(), name)
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return "", nil, store.ErrNotFound
	}
	if err != nil {
		return "", nil, err
	}
	if !info.Mode().IsRegular() {
		return "", nil, store.ErrNotFound
	}
	return path, info, nil
}

func verifiedDaily(name string) (string, os.FileInfo, error) {
	path, info, err := dailyFile(name)
	if err != nil {
		return path, info, err
	}
	checksum, err := os.ReadFile(path + ".sha256")
	if err != nil {
		return "", nil, errors.New("checksum do backup indisponível")
	}
	fields := strings.Fields(string(checksum))
	if len(fields) != 2 || fields[1] != name || len(fields[0]) != 64 {
		return "", nil, errors.New("checksum inválido")
	}
	file, err := os.Open(path)
	if err != nil {
		return "", nil, err
	}
	defer file.Close()
	sum := sha256.New()
	if _, err = io.Copy(sum, file); err != nil {
		return "", nil, err
	}
	if !strings.EqualFold(hex.EncodeToString(sum.Sum(nil)), fields[0]) {
		return "", nil, errors.New("a integridade deste backup não pôde ser confirmada")
	}
	return path, info, nil
}

func listDaily() ([]store.BackupInfo, error) {
	files, err := os.ReadDir(backupDirectory())
	if os.IsNotExist(err) {
		return []store.BackupInfo{}, nil
	}
	if err != nil {
		return nil, err
	}
	items := []store.BackupInfo{}
	for _, file := range files {
		name := file.Name()
		if !dailyName.MatchString(name) {
			continue
		}
		path, info, err := dailyFile(name)
		if err != nil {
			continue
		}
		_, err = os.Stat(path + ".sha256")
		if err != nil {
			continue
		}
		created, err := time.Parse("20060102T150405Z", strings.TrimSuffix(strings.TrimPrefix(name, "jogos-escolares-"), ".dump"))
		if err != nil {
			continue
		}
		items = append(items, store.BackupInfo{Key: "daily/" + name, Kind: "DAILY", CreatedAt: created, FileName: name, Size: info.Size(), CanRestore: true})
	}
	return items, nil
}

// Keep long-lived WebSocket/SSE connections out of the operation lock. Every
// ordinary request finishes before a restore, and new requests fail explicitly
// while restoration is running instead of writing against an outdated cache.
func (s *server) backupGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/v1/admin/backups/") && strings.HasSuffix(r.URL.Path, "/restore") || r.URL.Path == "/api/v1/ws" || r.URL.Path == "/api/v1/events" || r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		if !s.backupOps.TryRLock() {
			w.Header().Set("Retry-After", "5")
			http.Error(w, "Restauração em andamento. Aguarde e tente novamente.", 503)
			return
		}
		defer s.backupOps.RUnlock()
		next.ServeHTTP(w, r)
	})
}

func (s *server) adminBackups(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
	defer cancel()
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
	user, err := s.store.BackupAdminID(ctx, token)
	if token == "" || err != nil {
		http.Error(w, "não autorizado", 401)
		return
	}
	if r.URL.Path == "/api/v1/admin/backups" {
		if r.Method != "GET" {
			http.Error(w, "method not allowed", 405)
			return
		}
		items, err := s.store.ListResultBackups(ctx)
		if err != nil {
			serverError(w, err)
			return
		}
		daily, err := listDaily()
		if err != nil {
			logBackupError(err)
			daily = []store.BackupInfo{}
		}
		items = append(items, daily...)
		sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, 200, map[string]any{"items": items, "timezone": "America/Sao_Paulo"})
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/backups/"), "/")
	if len(parts) != 3 || (parts[0] != "db" && parts[0] != "daily") {
		http.NotFound(w, r)
		return
	}
	source := parts[0] + "/" + parts[1]
	if parts[2] == "download" && r.Method == "GET" {
		w.Header().Set("Cache-Control", "no-store")
		if parts[0] == "daily" {
			path, _, err := verifiedDaily(parts[1])
			if err != nil {
				backupError(w, err)
				return
			}
			w.Header().Set("Content-Disposition", `attachment; filename="`+parts[1]+`"`)
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeFile(w, r, path)
			return
		}
		id, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || id < 1 {
			http.NotFound(w, r)
			return
		}
		snapshot, err := s.store.ResultBackup(ctx, id)
		if err != nil {
			backupError(w, err)
			return
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="resultados-backup-%d.json"`, id))
		writeJSON(w, 200, map[string]any{"format": "jogos-escolares-results-v1", "snapshot": snapshot})
		return
	}
	if parts[2] != "restore" || r.Method != "POST" {
		http.Error(w, "method not allowed", 405)
		return
	}
	var input struct {
		Confirmation string `json:"confirmation"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&input) != nil || input.Confirmation != "RESTAURAR" {
		http.Error(w, "confirme digitando RESTAURAR", 400)
		return
	}
	if !s.backupOps.TryLock() {
		http.Error(w, "Há outra operação em andamento. Aguarde e tente novamente.", 409)
		return
	}
	locked := true
	defer func() {
		if locked {
			s.backupOps.Unlock()
		}
	}()
	var snapshot store.ResultSnapshot
	if parts[0] == "daily" {
		path, _, verifyErr := verifiedDaily(parts[1])
		if verifyErr != nil {
			backupError(w, verifyErr)
			return
		}
		snapshot, err = readDailySnapshot(ctx, path)
	} else {
		id, parseErr := strconv.ParseInt(parts[1], 10, 64)
		if parseErr != nil || id < 1 {
			http.NotFound(w, r)
			return
		}
		snapshot, err = s.store.ResultBackup(ctx, id)
	}
	if err != nil {
		backupError(w, err)
		return
	}
	result, err := s.store.RestoreResults(ctx, snapshot, user, source)
	if err != nil {
		backupError(w, err)
		return
	}
	s.replaceCachedMatches(result.Matches)
	s.backupOps.Unlock()
	locked = false
	for _, period := range []string{"MANHA", "TARDE"} {
		s.events.publish(map[string]any{"type": "BACKUP_RESTORED", "period": period})
		s.broadcastScoreboard(period)
	}
	writeJSON(w, 200, map[string]any{"restored": true, "safetyBackupId": result.SafetyBackupID})
}

func logBackupError(err error) { log.Printf("backup operation failed: %v", err) }
func backupError(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "backup não encontrado", 404)
		return
	}
	if errors.Is(err, store.ErrIncompatibleBackup) {
		http.Error(w, err.Error(), 409)
		return
	}
	logBackupError(err)
	http.Error(w, "Não foi possível confirmar a operação do backup. Confira a cópia e atualize a lista e os resultados antes de tentar novamente.", 500)
}

func readDailySnapshot(ctx context.Context, path string) (store.ResultSnapshot, error) {
	cmd := exec.CommandContext(ctx, "pg_restore", "--data-only", "--schema=public", "--table=matches", "--table=penalties", "--table=finals_confirmations", "--table=final_matches", "--file=-", path)
	var out cappedBuffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return store.ResultSnapshot{}, fmt.Errorf("pg_restore: %w", err)
	}
	return parseBackupCopy(out.Bytes())
}

type cappedBuffer struct{ bytes.Buffer }

func (b *cappedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 32*1024*1024 {
		return 0, errors.New("backup operacional excede o limite")
	}
	return b.Buffer.Write(p)
}

var copyHeader = regexp.MustCompile(`^COPY public\.(matches|penalties|finals_confirmations|final_matches) \(([^)]+)\) FROM stdin;$`)

// Parse data, never execute SQL extracted from an archive. Restoring identities,
// access tokens, audit history or other tables is deliberately impossible here.
func parseBackupCopy(raw []byte) (store.ResultSnapshot, error) {
	tables := map[string][]map[string]any{"matches": {}, "penalties": {}, "finals_confirmations": {}, "final_matches": {}}
	table := ""
	var columns []string
	seenMatches := false
	scan := bufio.NewScanner(bytes.NewReader(raw))
	scan.Buffer(make([]byte, 4096), 1024*1024)
	for scan.Scan() {
		line := scan.Text()
		if table == "" {
			if h := copyHeader.FindStringSubmatch(line); h != nil {
				table = h[1]
				columns = strings.Split(h[2], ", ")
				if table == "matches" {
					seenMatches = true
				}
			}
			continue
		}
		if line == `\.` {
			table = ""
			continue
		}
		values := strings.Split(line, "\t")
		if len(values) != len(columns) {
			return store.ResultSnapshot{}, errors.New("linha de backup inválida")
		}
		row := map[string]any{}
		for i, col := range columns {
			if values[i] == `\N` {
				row[col] = nil
				continue
			}
			v, err := unescapeCopy(values[i])
			if err != nil {
				return store.ResultSnapshot{}, err
			}
			numeric := col == "score_a" || col == "score_b" || col == "sort_order" || col == "points" || (col == "id" && table == "penalties")
			if numeric {
				n, err := strconv.ParseInt(v, 10, 64)
				if err != nil {
					return store.ResultSnapshot{}, err
				}
				row[col] = n
			} else if col == "needs_review" {
				if v != "t" && v != "f" {
					return store.ResultSnapshot{}, errors.New("boolean inválido")
				}
				row[col] = v == "t"
			} else {
				row[col] = v
			}
		}
		tables[table] = append(tables[table], row)
	}
	if err := scan.Err(); err != nil {
		return store.ResultSnapshot{}, err
	}
	if table != "" || !seenMatches || len(tables["matches"]) == 0 {
		return store.ResultSnapshot{}, errors.New("partidas não encontradas no arquivo")
	}
	marshal := func(key string) json.RawMessage { b, _ := json.Marshal(tables[key]); return b }
	return store.ResultSnapshot{Matches: marshal("matches"), Penalties: marshal("penalties"), Confirmations: marshal("finals_confirmations"), Finals: marshal("final_matches")}, nil
}

func unescapeCopy(value string) (string, error) {
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		if value[i] != '\\' {
			b.WriteByte(value[i])
			continue
		}
		i++
		if i == len(value) {
			return "", errors.New("escape inválido")
		}
		switch value[i] {
		case 'b':
			b.WriteByte('\b')
		case 'f':
			b.WriteByte('\f')
		case 'n':
			b.WriteByte('\n')
		case 'r':
			b.WriteByte('\r')
		case 't':
			b.WriteByte('\t')
		case 'v':
			b.WriteByte('\v')
		case '\\':
			b.WriteByte('\\')
		default:
			if value[i] >= '0' && value[i] <= '7' {
				start := i
				for i+1 < len(value) && i-start < 2 && value[i+1] >= '0' && value[i+1] <= '7' {
					i++
				}
				n, err := strconv.ParseUint(value[start:i+1], 8, 8)
				if err != nil {
					return "", err
				}
				b.WriteByte(byte(n))
			} else if value[i] == 'x' {
				start := i + 1
				for i+1 < len(value) && i+1-start < 2 && strings.ContainsRune("0123456789abcdefABCDEF", rune(value[i+1])) {
					i++
				}
				if i < start {
					return "", errors.New("escape hexadecimal inválido")
				}
				n, err := strconv.ParseUint(value[start:i+1], 16, 8)
				if err != nil {
					return "", err
				}
				b.WriteByte(byte(n))
			} else {
				b.WriteByte(value[i])
			}
		}
	}
	return b.String(), nil
}
