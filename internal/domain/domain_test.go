package domain

import "testing"

func TestSeedMatchesPreservesLegacyCountAndReferences(t *testing.T) {
	teams, matches := SeedTeams(), SeedMatches()
	if len(teams) != 21 {
		t.Fatalf("equipes: got %d, want 21", len(teams))
	}
	if len(matches) != 504 {
		t.Fatalf("partidas: got %d, want 504", len(matches))
	}
	known := map[string]bool{}
	for _, team := range teams {
		known[team.ID] = true
	}
	for _, match := range matches {
		if !known[match.TeamAID] || !known[match.TeamBID] {
			t.Fatalf("partida %s referencia equipe inexistente", match.ID)
		}
	}
}
func TestCalculateStandingsUsesRules(t *testing.T) {
	teams := []Team{{ID: "MANHA_A", Period: "MANHA", Color: "Azul", Active: true}, {ID: "MANHA_B", Period: "MANHA", Color: "Amarelo", Active: true}, {ID: "MANHA_C", Period: "MANHA", Color: "Verde", Active: true}}
	matches := []Match{{Period: "MANHA", Gender: "MASCULINO", TeamAID: "MANHA_A", TeamBID: "MANHA_B", Status: StatusFinalizado, ScoreA: 2, ScoreB: 0}, {Period: "MANHA", Gender: "FEMININO", TeamAID: "MANHA_B", TeamBID: "MANHA_C", Status: StatusFinalizado, ScoreA: 1, ScoreB: 0}}
	rows := CalculateStandings(teams, matches, "MANHA", GeneroGeral)
	if rows[0].Color != "Amarelo" || rows[0].Points != 3 {
		t.Fatalf("desempate inesperado: %#v", rows)
	}
	if rows[1].Color != "Azul" || rows[1].Points != 3 {
		t.Fatalf("segunda posição inesperada: %#v", rows)
	}
	filtered := CalculateStandings(teams, matches, "MANHA", "MASCULINO")
	if filtered[0].Color != "Azul" || filtered[0].Games != 1 {
		t.Fatalf("filtro por gênero incorreto: %#v", filtered)
	}
}
