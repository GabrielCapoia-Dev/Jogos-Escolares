package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"jogos-escolares/internal/domain"
	"jogos-escolares/internal/store"
)

type server struct {
	store *store.Store
	events *eventHub
}

type eventHub struct {
	mu      sync.RWMutex
	clients map[chan []byte]struct{}
}

func newEventHub() *eventHub {
	return &eventHub{clients: make(map[chan []byte]struct{})}
}

func (h *eventHub) subscribe() (chan []byte, func()) {
	ch := make(chan []byte, 8)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		if _, ok := h.clients[ch]; ok {
			delete(h.clients, ch)
			close(ch)
		}
		h.mu.Unlock()
	}
}

func (h *eventHub) publish(value any) {
	payload, err := json.Marshal(value)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.clients {
		select {
		case ch <- payload:
		default:
		}
	}
}
type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type resultRequest struct {
	ScoreA int `json:"scoreA"`
	ScoreB int `json:"scoreB"`
}

func main() {
	ctx := context.Background()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://jogos:jogos_dev@localhost:5432/jogos_escolares?sslmode=disable"
	}
	db, err := store.Open(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	defer db.DB.Close()
	s := &server{store: db, events: newEventHub()}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/api/v1/config", s.config)
	mux.HandleFunc("/api/v1/events", s.eventsStream)
	mux.HandleFunc("/api/v1/auth/login", s.login)
	mux.HandleFunc("/api/v1/periods", jsonHandler(domain.Periods))
	mux.HandleFunc("/api/v1/days", jsonHandler(domain.Days))
	mux.HandleFunc("/api/v1/courts", jsonHandler(domain.Courts))
	mux.HandleFunc("/api/v1/sports", jsonHandler(domain.Sports))
	mux.HandleFunc("/api/v1/teams", s.teams)
	mux.HandleFunc("/api/v1/matches", s.matches)
	mux.HandleFunc("/api/v1/standings", s.standings)
	mux.HandleFunc("/api/v1/snapshot", s.snapshot)
	mux.HandleFunc("/api/v1/admin/matches/", s.result)
	addr := os.Getenv("HTTP_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}
func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}
func (s *server) config(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]any{"year": 2026, "points": map[string]int{"win": 3, "draw": 1, "loss": 0}, "refreshSeconds": 10})
}
func (s *server) eventsStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch, unsubscribe := s.events.subscribe()
	defer unsubscribe()

	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()

	keepAlive := time.NewTicker(20 * time.Second)
	defer keepAlive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case payload, ok := <-ch:
			if !ok {
				return
			}
			_, _ = w.Write([]byte("data: "))
			_, _ = w.Write(payload)
			_, _ = w.Write([]byte("\n\n"))
			flusher.Flush()
		case <-keepAlive.C:
			_, _ = w.Write([]byte(": keep-alive\n\n"))
			flusher.Flush()
		}
	}
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	var input loginRequest
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		http.Error(w, "payload inválido", 400)
		return
	}
	token, err := s.store.Login(r.Context(), input.Email, input.Password)
	if err != nil {
		http.Error(w, "credenciais inválidas", 401)
		return
	}
	writeJSON(w, 200, map[string]string{"accessToken": token, "tokenType": "Bearer", "expiresIn": "12h"})
}
func (s *server) teams(w http.ResponseWriter, r *http.Request) {
	out, err := s.store.Teams(r.Context(), r.URL.Query().Get("period"))
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (s *server) matches(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	out, err := s.store.Matches(r.Context(), q.Get("period"), q.Get("day"), q.Get("court"), q.Get("sport"), q.Get("gender"))
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, out)
}
func (s *server) standings(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		http.Error(w, "period is required", 400)
		return
	}
	teams, err := s.store.Teams(r.Context(), period)
	if err != nil {
		serverError(w, err)
		return
	}
	matches, err := s.store.Matches(r.Context(), period, "", "", "", "")
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, domain.CalculateStandings(teams, matches, period, r.URL.Query().Get("gender")))
}
func (s *server) snapshot(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		http.Error(w, "period is required", 400)
		return
	}
	gender := r.URL.Query().Get("gender")
	teams, err := s.store.Teams(r.Context(), period)
	if err != nil {
		serverError(w, err)
		return
	}
	matches, err := s.store.Matches(r.Context(), period, "", "", "", "")
	if err != nil {
		serverError(w, err)
		return
	}
	finished := make([]domain.Match, 0)
	for _, match := range matches {
		if match.Status == domain.StatusFinalizado {
			finished = append(finished, match)
		}
	}
	writeJSON(w, 200, map[string]any{
		"teams":     teams,
		"standings": domain.CalculateStandings(teams, matches, period, gender),
		"matches":   finished,
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *server) result(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPut {
		http.Error(w, "method not allowed", 405)
		return
	}
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer"))
	if token == "" {
		http.Error(w, "autenticação obrigatória", 401)
		return
	}
	user, err := s.store.UserID(r.Context(), token)
	if err != nil {
		http.Error(w, "não autorizado", 401)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/matches/")
	id = strings.TrimSuffix(id, "/result")
	if id == "" {
		http.Error(w, "partida obrigatória", 400)
		return
	}
	var input resultRequest
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		http.Error(w, "payload inválido", 400)
		return
	}
	match, err := s.store.SaveResult(r.Context(), id, input.ScoreA, input.ScoreB, user, r.Method == http.MethodPut)
	if err != nil {
		status := 409
		if errors.Is(err, store.ErrNotFound) {
			status = 404
		}
		http.Error(w, err.Error(), status)
		return
	}
	s.events.publish(map[string]any{
		"type":    "RESULT_UPDATED",
		"matchId": match.ID,
		"period":  match.Period,
		"day":     match.Day,
		"court":   match.Court,
		"sportId": match.SportID,
		"gender":  match.Gender,
		"scoreA":  match.ScoreA,
		"scoreB":  match.ScoreB,
		"status":  match.Status,
	})
	writeJSON(w, 200, match)
}
func jsonHandler(value any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, value) }
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func serverError(w http.ResponseWriter, err error) {
	log.Print(err)
	http.Error(w, "erro interno", 500)
}
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := os.Getenv("CORS_ORIGIN")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
