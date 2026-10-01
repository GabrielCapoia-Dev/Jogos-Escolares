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
	if rows[0].Color != "Azul" || rows[0].Points != 3 {
		t.Fatalf("desempate inesperado: %#v", rows)
	}
	if rows[1].Color != "Amarelo" || rows[1].Points != 3 {
		t.Fatalf("segunda posição inesperada: %#v", rows)
	}
	if rows[0].Tiebreaker != "Menos derrotas" || rows[1].Tiebreaker != "Menos derrotas" {
		t.Fatalf("critério de derrotas não identificado: %#v", rows[:2])
	}
	filtered := CalculateStandings(teams, matches, "MANHA", "MASCULINO")
	if filtered[0].Color != "Azul" || filtered[0].Games != 1 {
		t.Fatalf("filtro por gênero incorreto: %#v", filtered)
	}
}

func TestCalculateStandingsLeavesExactTieForCoinToss(t *testing.T) {
	teams := []Team{{ID: "A", Period: "MANHA", Color: "Amarelo", Active: true}, {ID: "B", Period: "MANHA", Color: "Azul", Active: true}, {ID: "C", Period: "MANHA", Color: "Verde", Active: true}}
	// Os três têm a mesma campanha e permanecem empatados para decisão por moeda.
	matches := []Match{
		{Period: "MANHA", Gender: "MASCULINO", Status: StatusFinalizado, TeamAID: "A", TeamBID: "B", ScoreA: 1, ScoreB: 1},
		{Period: "MANHA", Gender: "MASCULINO", Status: StatusFinalizado, TeamAID: "A", TeamBID: "C", ScoreA: 1, ScoreB: 1},
		{Period: "MANHA", Gender: "MASCULINO", Status: StatusFinalizado, TeamAID: "B", TeamBID: "C", ScoreA: 1, ScoreB: 1},
	}
	rows := CalculateStandings(teams, matches, "MANHA", GeneroGeral)
	if !rows[0].Tied || !rows[1].Tied || !rows[2].Tied || rows[0].Position != rows[1].Position || rows[1].Position != rows[2].Position {
		t.Fatalf("critério de empates não aplicado: %#v", rows)
	}
}

func TestCalculateStandingsDoesNotTreatUnplayedTeamsAsCoinToss(t *testing.T) {
	teams := []Team{{ID: "A", Period: "MANHA", Color: "Amarelo", Active: true}, {ID: "B", Period: "MANHA", Color: "Azul", Active: true}}
	rows := CalculateStandings(teams, nil, "MANHA", GeneroGeral)
	if rows[0].Position == rows[1].Position || rows[0].Tied || rows[1].Tied {
		t.Fatalf("equipes sem jogos não devem gerar empate por moeda: %#v", rows)
	}
}

func TestCalculateStandingsAppliesPenaltiesOnlyToOverallPeriod(t *testing.T) {
	teams := []Team{
		{ID: "AM", Period: "MANHA", Color: "Amarelo", Active: true},
		{ID: "BM", Period: "MANHA", Color: "Azul", Active: true},
		{ID: "AT", Period: "TARDE", Color: "Amarelo", Active: true},
	}
	matches := []Match{{Period: "MANHA", Gender: "MASCULINO", Status: StatusFinalizado, TeamAID: "AM", TeamBID: "BM", ScoreA: 2, ScoreB: 0}}
	penalties := []Penalty{{Period: "MANHA", TeamID: "AM", Points: 2}}

	rows := CalculateStandingsWithPenalties(teams, matches, penalties, "MANHA", GeneroGeral)
	if rows[0].TeamID != "BM" || rows[1].TeamID != "AM" || rows[1].Points != 1 || rows[1].PenaltyPoints != 2 {
		t.Fatalf("dedução não alterou a classificação pelo saldo líquido: %#v", rows)
	}
	genderRows := CalculateStandingsWithPenalties(teams, matches, penalties, "MANHA", "MASCULINO")
	if genderRows[0].TeamID != "AM" || genderRows[0].Points != 3 || genderRows[0].PenaltyPoints != 0 {
		t.Fatalf("punição indevidamente aplicada ao recorte de gênero: %#v", genderRows)
	}
	otherPeriod := CalculateStandingsWithPenalties(teams, nil, penalties, "TARDE", GeneroGeral)
	if len(otherPeriod) != 1 || otherPeriod[0].Points != 0 || otherPeriod[0].PenaltyPoints != 0 {
		t.Fatalf("punição atravessou períodos: %#v", otherPeriod)
	}
}
