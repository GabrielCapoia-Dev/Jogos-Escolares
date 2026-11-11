package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestParseBackupCopyDataOnly(t *testing.T) {
	raw := `-- user and token tables must never be restored
COPY public.users (id, email) FROM stdin;
not-used\tprivate
\.
COPY public.matches (id, score_a, score_b, sort_order, updated_at) FROM stdin;
PARTIDA_001	3	1	1	\N
\.
COPY public.penalties (id, team_id, points, reason) FROM stdin;
1	MANHA_AMARELO	2	Motivo\tcom tab\nlinha e \\barra: Onça
\.
COPY public.finals_confirmations (period_id, needs_review) FROM stdin;
MANHA	f
\.
COPY public.final_matches (id, score_a, score_b) FROM stdin;
FINAL_1	2	2
\.
`
	b, err := parseBackupCopy([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	var m, p, f []map[string]any
	if json.Unmarshal(b.Matches, &m) != nil || json.Unmarshal(b.Penalties, &p) != nil || json.Unmarshal(b.Confirmations, &f) != nil {
		t.Fatal("invalid JSON")
	}
	if m[0]["score_a"] != float64(3) || m[0]["updated_at"] != nil || f[0]["needs_review"] != false {
		t.Fatalf("wrong typed fields: %v %v", m, f)
	}
	if p[0]["reason"] != "Motivo\tcom tab\nlinha e \\barra: Onça" {
		t.Fatalf("wrong escape: %q", p[0]["reason"])
	}
}

func TestParseCopyRejectsMalformedArchive(t *testing.T) {
	for _, s := range []string{"", "COPY public.users (id) FROM stdin;\nx\n\\.\n", "COPY public.matches (id, score_a) FROM stdin;\nx\n\\.\n", "COPY public.matches (id) FROM stdin;\nx\n"} {
		if _, err := parseBackupCopy([]byte(s)); err == nil {
			t.Fatalf("accepted bad data %q", s)
		}
	}
}

func TestCopyEscapes(t *testing.T) {
	value, err := unescapeCopy(`a\141\x62\t\n\\`)
	if err != nil || value != "aab\t\n\\" {
		t.Fatalf("%q %v", value, err)
	}
	if _, err := unescapeCopy(`bad\`); err == nil {
		t.Fatal("accepted trailing escape")
	}
}

func TestDailyArchiveIntegrityAndPath(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BACKUP_DIR", dir)
	name := "jogos-escolares-20261111T030000Z.dump"
	content := []byte("archive")
	if err := os.WriteFile(filepath.Join(dir, name), content, 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	os.WriteFile(filepath.Join(dir, name+".sha256"), []byte(fmt.Sprintf("%x  %s\n", sum, name)), 0600)
	if _, _, err := verifiedDaily(name); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"../../etc/passwd", "file.dump", "jogos-escolares-20261111T030000Z.dump/../../x"} {
		if _, _, err := dailyFile(bad); err == nil {
			t.Fatal("accepted path", bad)
		}
	}
	os.WriteFile(filepath.Join(dir, name), []byte("corrupt"), 0600)
	if _, _, err := verifiedDaily(name); err == nil {
		t.Fatal("accepted corrupt archive")
	}
	alias := "jogos-escolares-20261112T030000Z.dump"
	if err := os.Symlink(filepath.Join(dir, name), filepath.Join(dir, alias)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := dailyFile(alias); err == nil {
		t.Fatal("accepted symlink")
	}
}

func TestRestoreGuardPreventsConcurrentRequests(t *testing.T) {
	s := &server{}
	handler := s.backupGuard(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	s.backupOps.Lock()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("POST", "/api/v1/admin/matches/x/result", nil))
	if recorder.Code != 503 {
		t.Fatal(recorder.Code)
	}
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest("GET", "/api/v1/ws", nil))
	if recorder.Code != 200 {
		t.Fatal("long-lived connection blocked")
	}
	s.backupOps.Unlock()
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequestWithContext(context.Background(), "GET", "/api/v1/matches", nil))
	if recorder.Code != 200 {
		t.Fatal(recorder.Code)
	}
}
