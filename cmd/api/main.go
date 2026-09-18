package main

import (
	"encoding/json"
	"jogos-escolares/internal/domain"
	"log"
	"net/http"
	"os"
)

type server struct {
	teams   []domain.Team
	matches []domain.Match
}

func main() {
	s := &server{domain.SeedTeams(), domain.SeedMatches()}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.health)
	mux.HandleFunc("/api/v1/config", s.config)
	mux.HandleFunc("/api/v1/periods", jsonHandler(domain.Periods))
	mux.HandleFunc("/api/v1/days", jsonHandler(domain.Days))
	mux.HandleFunc("/api/v1/courts", jsonHandler(domain.Courts))
	mux.HandleFunc("/api/v1/sports", jsonHandler(domain.Sports))
	mux.HandleFunc("/api/v1/teams", s.teamsHandler)
	mux.HandleFunc("/api/v1/matches", s.matchesHandler)
	mux.HandleFunc("/api/v1/standings", s.standingsHandler)
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
func (s *server) teamsHandler(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	out := s.teams
	if period != "" {
		out = filterTeams(out, period)
	}
	writeJSON(w, 200, out)
}
func (s *server) matchesHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	out := make([]domain.Match, 0)
	for _, m := range s.matches {
		if q.Get("period") != "" && m.Period != q.Get("period") || q.Get("day") != "" && m.Day != q.Get("day") || q.Get("court") != "" && m.Court != q.Get("court") || q.Get("sport") != "" && m.SportID != q.Get("sport") || q.Get("gender") != "" && m.Gender != q.Get("gender") {
			continue
		}
		out = append(out, m)
	}
	writeJSON(w, 200, out)
}
func (s *server) standingsHandler(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		http.Error(w, "period is required", 400)
		return
	}
	writeJSON(w, 200, domain.CalculateStandings(s.teams, s.matches, period, r.URL.Query().Get("gender")))
}
func filterTeams(all []domain.Team, period string) []domain.Team {
	out := []domain.Team{}
	for _, t := range all {
		if t.Period == period {
			out = append(out, t)
		}
	}
	return out
}
func jsonHandler(value any) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, value) }
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := os.Getenv("CORS_ORIGIN")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
