package domain

import "testing"

func TestFinalistSelectionKeepsGuaranteedPlaces(t *testing.T) {
	rows := []Standing{{TeamID: "A", Position: 1}, {TeamID: "B", Position: 2}, {TeamID: "C", Position: 3}, {TeamID: "D", Position: 3}, {TeamID: "E", Position: 3}}
	if ValidFinalistSelection(rows, []string{"C", "D", "E"}) {
		t.Fatal("tie at third place cannot displace first and second")
	}
	if !ValidFinalistSelection(rows, []string{"A", "B", "D"}) {
		t.Fatal("organization may select a tied team for the remaining place")
	}
	if ValidFinalistSelection(rows, []string{"A", "A", "B"}) {
		t.Fatal("duplicate finalists accepted")
	}
	for i := range rows {
		rows[i].Position = 1
	}
	if !ValidFinalistSelection(rows, []string{"C", "D", "E"}) {
		t.Fatal("three teams may be chosen from a complete tie")
	}
}

func TestFinalMatchesStaySeparateAndKeepSchedule(t *testing.T) {
	for _, period := range []string{"MANHA", "TARDE"} {
		ids := []string{period + "_A", period + "_B", period + "_C"}
		matches := SeedFinalMatches(period, ids)
		if len(matches) != 18 {
			t.Fatalf("%s: got %d final games", period, len(matches))
		}
		counts := map[string]int{}
		for _, m := range matches {
			if m.Day != FinalDay || m.Period != period || m.TeamAID == m.TeamBID || m.SportID == "CORRIDA" {
				t.Fatalf("invalid final game: %#v", m)
			}
			counts[m.TeamAID+"|"+m.Gender+"|"+m.SportID]++
			counts[m.TeamBID+"|"+m.Gender+"|"+m.SportID]++
		}
		for key, n := range counts {
			if n != 2 {
				t.Fatalf("%s has %d games, want two", key, n)
			}
		}
		first, last := "08:30", "09:36"
		if period == "TARDE" {
			first, last = "13:30", "14:36"
		}
		if matches[0].Time != first || matches[len(matches)-1].Time != last {
			t.Fatal("final schedule has incorrect period")
		}
	}
}
