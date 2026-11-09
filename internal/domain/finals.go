package domain

import "fmt"

const FinalDay = "FINAL"

type FinalScheduleEntry struct {
	Order   int    `json:"order"`
	SportID string `json:"sportId"`
	Court   string `json:"court"`
	Time    string `json:"time"`
	A       int    `json:"a"`
	B       int    `json:"b"`
}

// FinalSchedule keeps the existing A/B/C round-robin and twelve-minute slots.
// The afternoon uses the same offsets from the afternoon's 13:30 start.
func FinalSchedule(period string) []FinalScheduleEntry {
	start := 8*60 + 30
	if period == "TARDE" {
		start = 13*60 + 30
	}
	pairs := [][2]int{{0, 1}, {0, 2}, {1, 2}}
	entries := make([]FinalScheduleEntry, 0, 9)
	for sportIndex, sport := range []string{"BASQUETE", "PETECA", "FUTSAL"} {
		court, offset := "QUADRA_1", 42
		if sportIndex == 0 {
			court, offset = "QUADRA_2", 0
		}
		for i, pair := range pairs {
			minutes := start + offset + i*12
			entries = append(entries, FinalScheduleEntry{
				Order: len(entries) + 1, SportID: sport, Court: court,
				Time: fmt.Sprintf("%02d:%02d", minutes/60, minutes%60), A: pair[0], B: pair[1],
			})
		}
	}
	return entries
}

func SeedFinalMatches(period string, finalists []string) []Match {
	if (period != "MANHA" && period != "TARDE") || len(finalists) != 3 {
		return nil
	}
	matches := make([]Match, 0, 18)
	for _, entry := range FinalSchedule(period) {
		for _, gender := range []string{"MASCULINO", "FEMININO"} {
			matches = append(matches, Match{
				ID:     fmt.Sprintf("FINAL_%s_%02d_%s", period, entry.Order, gender),
				Period: period, Day: FinalDay, Court: entry.Court, Time: entry.Time,
				SportID: entry.SportID, Gender: gender, TeamAID: finalists[entry.A], TeamBID: finalists[entry.B],
				Status: StatusAguardando, Order: entry.Order,
			})
		}
	}
	return matches
}

// ValidFinalistSelection lets the organization resolve only the tie at the
// qualification cutoff. Teams already guaranteed a place cannot be omitted.
func ValidFinalistSelection(standings []Standing, ids []string) bool {
	if len(standings) < 3 || len(ids) != 3 {
		return false
	}
	cutoff := standings[2].Position
	eligible, selected := map[string]bool{}, map[string]bool{}
	for _, row := range standings {
		if row.Position <= cutoff {
			eligible[row.TeamID] = true
		}
	}
	for _, id := range ids {
		if !eligible[id] || selected[id] {
			return false
		}
		selected[id] = true
	}
	for _, row := range standings {
		if row.Position < cutoff && !selected[row.TeamID] {
			return false
		}
	}
	return true
}
