package domain

import (
	"sort"
	"testing"
	"time"
)

func TestSeedMatchesTenTeamsEightGamesAndOneCourtChange(t *testing.T) {
	teams, matches := SeedTeams(), SeedMatches()
	if len(teams) != 20 {
		t.Fatalf("equipes: got %d, want 20", len(teams))
	}
	if len(matches) != 480 {
		t.Fatalf("partidas: got %d, want 480", len(matches))
	}
	known := map[string]Team{}
	periods := map[string]int{}
	for _, team := range teams {
		if team.Mascot == "Bem-te-vi" {
			t.Fatalf("Bem-te-vi ainda cadastrado: %s", team.ID)
		}
		known[team.ID] = team
		periods[team.Period]++
	}
	if periods["MANHA"] != 10 || periods["TARDE"] != 10 || known["TARDE_AZUL_CLARO"].Mascot != "Tartaruga" {
		t.Fatalf("distribuição de equipes incorreta: %#v", periods)
	}
	type appearance struct{ time, court, sport, opponent string }
	played := map[string][]appearance{}
	laneCount := map[string]int{}
	slots := map[string]bool{}
	for _, match := range matches {
		if _, ok := known[match.TeamAID]; !ok {
			t.Fatalf("partida %s referencia equipe inexistente", match.ID)
		}
		if _, ok := known[match.TeamBID]; !ok {
			t.Fatalf("partida %s referencia equipe inexistente", match.ID)
		}
		if match.TeamAID == match.TeamBID || known[match.TeamAID].Period != match.Period || known[match.TeamBID].Period != match.Period {
			t.Fatalf("equipes inválidas na partida %s", match.ID)
		}
		lane := match.Period + match.Day + match.Court + match.SportID + match.Gender
		laneCount[lane]++
		for team, opponent := range map[string]string{match.TeamAID: match.TeamBID, match.TeamBID: match.TeamAID} {
			key := match.Day + match.Gender + team
			played[key] = append(played[key], appearance{match.Time, match.Court, match.SportID, opponent})
			slot := key + match.Time
			if slots[slot] {
				t.Fatalf("%s tem jogos simultâneos às %s", team, match.Time)
			}
			slots[slot] = true
		}
	}
	if len(laneCount) != 48 {
		t.Fatalf("faixas de jogos: got %d, want 48", len(laneCount))
	}
	for lane, count := range laneCount {
		if count != 10 {
			t.Fatalf("%s contém %d partidas, quer 10", lane, count)
		}
	}
	if len(played) != 120 {
		t.Fatalf("grupos equipe/dia/gênero: got %d, want 120", len(played))
	}
	for key, appearances := range played {
		if len(appearances) != 8 {
			t.Fatalf("%s joga %d vezes, quer 8", key, len(appearances))
		}
		sort.Slice(appearances, func(i, j int) bool { return appearances[i].time < appearances[j].time })
		bySport, byCourt := map[string]int{}, map[string]int{}
		seenOpponent := map[string]bool{}
		changes := 0
		for i, game := range appearances {
			bySport[game.sport]++
			byCourt[game.court]++
			pair := game.sport + game.opponent
			if seenOpponent[pair] {
				t.Fatalf("%s repete adversário na modalidade %s", key, game.sport)
			}
			seenOpponent[pair] = true
			if i > 0 && game.court != appearances[i-1].court {
				changes++
				previousStart, previousErr := time.Parse("15:04", appearances[i-1].time)
				nextStart, nextErr := time.Parse("15:04", game.time)
				if previousErr != nil || nextErr != nil || nextStart.Sub(previousStart) < 18*time.Minute {
					t.Fatalf("%s: troca de ginásio tem menos de 10 minutos após o jogo", key)
				}
			}
		}
		if changes != 1 || byCourt["QUADRA_1"] != 4 || byCourt["QUADRA_2"] != 4 {
			t.Fatalf("%s: trocas %d, quadras %#v", key, changes, byCourt)
		}
		for _, sport := range []string{"FUTSAL", "PETECA", "BASQUETE", "CORRIDA"} {
			if bySport[sport] != 2 {
				t.Fatalf("%s joga %d vezes %s, quer 2", key, bySport[sport], sport)
			}
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
