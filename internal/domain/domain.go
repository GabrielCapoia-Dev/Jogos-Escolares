package domain

import (
	"math/rand"
	"sort"
)

const (
	StatusAguardando  = "AGUARDANDO"
	StatusEmAndamento = "EM_ANDAMENTO"
	StatusFinalizado  = "FINALIZADO"
	StatusCancelado   = "CANCELADO"
	GeneroGeral       = "GERAL"
)

type Period struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Day struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Court struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Sport struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	CourtID   string `json:"courtId"`
	StartTime string `json:"startTime"`
	Active    bool   `json:"active"`
}
type Station struct {
	ID      string `json:"id"`
	CourtID string `json:"courtId"`
	SportID string `json:"sportId"`
	Gender  string `json:"gender"`
	Name    string `json:"name"`
	Order   int    `json:"order"`
}
type Team struct {
	ID     string `json:"id"`
	Period string `json:"period"`
	Color  string `json:"color"`
	Hex    string `json:"hex"`
	Mascot string `json:"mascot"`
	Sprite string `json:"sprite"`
	Active bool   `json:"active"`
}
type Match struct {
	ID        string `json:"id"`
	Period    string `json:"period"`
	Day       string `json:"day"`
	Court     string `json:"court"`
	Time      string `json:"time"`
	SportID   string `json:"sportId"`
	Gender    string `json:"gender"`
	TeamAID   string `json:"teamAId"`
	TeamBID   string `json:"teamBId"`
	Status    string `json:"status"`
	StationID string `json:"stationId"`
	Order     int    `json:"order"`
	ScoreA    int    `json:"scoreA"`
	ScoreB    int    `json:"scoreB"`
}
type Standing struct {
	TeamID   string `json:"teamId"`
	Color    string `json:"color"`
	Hex      string `json:"hex"`
	Mascot   string `json:"mascot"`
	Sprite   string `json:"sprite"`
	Points   int    `json:"points"`
	Games    int    `json:"games"`
	Wins     int    `json:"wins"`
	Draws    int    `json:"draws"`
	Losses   int    `json:"losses"`
	Position int    `json:"position"`
}

var Periods = []Period{{"MANHA", "Manhã"}, {"TARDE", "Tarde"}}
var Days = []Day{{"DIA_1", "Dia 1"}, {"DIA_2", "Dia 2"}, {"DIA_3", "Dia 3"}}
var Courts = []Court{{"QUADRA_1", "Amário Vieira"}, {"QUADRA_2", "Mario Onken"}}
var Sports = []Sport{{"PETECA", "Peteca", "PRE_DESPORTIVA", "QUADRA_1", "08:30", true}, {"FUTSAL", "Futsal", "COLETIVA", "QUADRA_1", "08:30", true}, {"BASQUETE", "Basquete", "COLETIVA", "QUADRA_2", "08:30", true}, {"CORRIDA", "Corrida", "REVEZAMENTO", "QUADRA_2", "08:30", true}}
var Stations = []Station{{"AMARIO_PETECA_FEM", "QUADRA_1", "PETECA", "FEMININO", "Peteca feminino", 1}, {"AMARIO_FUTSAL_MASC", "QUADRA_1", "FUTSAL", "MASCULINO", "Futsal masculino", 2}, {"AMARIO_FUTSAL_FEM", "QUADRA_1", "FUTSAL", "FEMININO", "Futsal feminino", 3}, {"AMARIO_PETECA_MASC", "QUADRA_1", "PETECA", "MASCULINO", "Peteca masculino", 4}, {"ONKEN_CORRIDA_FEM", "QUADRA_2", "CORRIDA", "FEMININO", "Corrida feminino", 1}, {"ONKEN_CORRIDA_MASC", "QUADRA_2", "CORRIDA", "MASCULINO", "Corrida masculino", 2}, {"ONKEN_BASQUETE_FEM", "QUADRA_2", "BASQUETE", "FEMININO", "Basquete feminino", 3}, {"ONKEN_BASQUETE_MASC", "QUADRA_2", "BASQUETE", "MASCULINO", "Basquete masculino", 4}}

type teamSeed struct{ code, color, hex, mascot, sprite string }

var teamSeeds = []teamSeed{{"AMARELO", "Amarelo", "#F3C515", "Onça", "mascote-amarelo"}, {"LARANJA", "Laranja", "#EF8615", "Mico-leão-dourado", "mascote-laranja"}, {"VERMELHO", "Vermelho", "#D84247", "Lobo-guará", "mascote-vermelho"}, {"MARROM", "Marrom", "#986347", "Capivara", "mascote-marrom"}, {"BRANCO", "Branco", "#F7F7F2", "Tamanduá", "mascote-branco"}, {"PRETO", "Preto", "#29313B", "Tucano", "mascote-preto"}, {"CINZA", "Cinza", "#8D9AA6", "Tubarão", "mascote-cinza"}, {"VERDE_CLARO", "Verde-claro", "#31BD75", "Sapo", "mascote-verde-claro"}, {"VERDE_ESCURO", "Verde-escuro", "#087D4B", "Jacaré", "mascote-verde-escuro"}, {"AZUL_ESCURO", "Azul-escuro", "#0753A4", "Arara-azul", "mascote-azul-escuro"}, {"AZUL_CLARO", "Azul-claro", "#35ACE0", "Boto", "mascote-azul-claro"}}

func SeedTeams() []Team {
	teams := make([]Team, 0, 21)
	for _, p := range Periods {
		limit := 10
		if p.ID == "MANHA" {
			limit = 11
		}
		for _, s := range teamSeeds[:limit] {
			teams = append(teams, Team{p.ID + "_" + s.code, p.ID, s.color, s.hex, s.mascot, s.sprite, true})
		}
	}
	return teams
}
func SeedMatches() []Match {
	teams := SeedTeams()
	matches := make([]Match, 0, 504)
	n := 1

	for periodIndex, p := range Periods {
		periodTeams := make([]Team, 0)
		for _, t := range teams {
			if t.Period == p.ID {
				periodTeams = append(periodTeams, t)
			}
		}

		// Ciclo-base usado apenas para escolher as partidas que poderão
		// aparecer como resultados simulados. Cada equipe aparece em 2 arestas.
		finalCycle := shuffledTeams(periodTeams, int64(202600+periodIndex*1000))

		for dayIndex, d := range Days {
			for stationIndex, st := range Stations {
				cycle := shuffledTeams(periodTeams, int64(202600+periodIndex*1000+dayIndex*100+stationIndex*7+1))

				// Espalha as arestas do ciclo de resultados pelos 3 dias e
				// pelas 8 estações. A partida forçada fica sempre na ordem 1.
				for edgeIndex := range finalCycle {
					targetDay := edgeIndex % len(Days)
					targetStation := (edgeIndex * 5) % len(Stations)
					if targetDay == dayIndex && targetStation == stationIndex {
						a := finalCycle[edgeIndex]
						b := finalCycle[(edgeIndex+1)%len(finalCycle)]
						cycle = forcePairAtStart(cycle, a.ID, b.ID)
						break
					}
				}

				for order := range cycle {
					a := cycle[order]
					b := cycle[(order+1)%len(cycle)]
					minute := 8*60 + 30 + order*13
					matches = append(matches, Match{
						ID:        formatID(n),
						Period:    p.ID,
						Day:       d.ID,
						Court:     st.CourtID,
						Time:      formatTime(minute),
						SportID:   st.SportID,
						Gender:    st.Gender,
						TeamAID:   a.ID,
						TeamBID:   b.ID,
						Status:    StatusAguardando,
						StationID: st.ID,
						Order:     order + 1,
					})
					n++
				}
			}
		}
	}
	return matches
}

func shuffledTeams(in []Team, seed int64) []Team {
	out := append([]Team(nil), in...)
	r := rand.New(rand.NewSource(seed))
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func forcePairAtStart(in []Team, aID, bID string) []Team {
	out := make([]Team, 0, len(in))
	var a, b Team
	for _, team := range in {
		switch team.ID {
		case aID:
			a = team
		case bID:
			b = team
		}
	}
	out = append(out, a, b)
	for _, team := range in {
		if team.ID != aID && team.ID != bID {
			out = append(out, team)
		}
	}
	return out
}

func formatID(n int) string { return "PARTIDA_" + pad3(n) }
func pad3(n int) string {
	if n < 10 {
		return "00" + itoa(n)
	}
	if n < 100 {
		return "0" + itoa(n)
	}
	return itoa(n)
}
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	out := ""
	for n > 0 {
		out = string(rune('0'+n%10)) + out
		n /= 10
	}
	return out
}
func formatTime(minutes int) string { return pad2(minutes/60) + ":" + pad2(minutes%60) }
func pad2(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func CalculateStandings(teams []Team, matches []Match, period, gender string) []Standing {
	rows := map[string]*Standing{}
	for _, team := range teams {
		if team.Period == period && team.Active {
			rows[team.ID] = &Standing{TeamID: team.ID, Color: team.Color, Hex: team.Hex, Mascot: team.Mascot, Sprite: team.Sprite}
		}
	}
	for _, m := range matches {
		if m.Period != period || m.Status != StatusFinalizado || (gender != "" && gender != GeneroGeral && m.Gender != gender) {
			continue
		}
		a, b := rows[m.TeamAID], rows[m.TeamBID]
		if a == nil || b == nil {
			continue
		}
		a.Games++
		b.Games++
		if m.ScoreA == m.ScoreB {
			a.Draws++
			b.Draws++
			a.Points++
			b.Points++
		} else if m.ScoreA > m.ScoreB {
			a.Wins++
			b.Losses++
			a.Points += 3
		} else {
			b.Wins++
			a.Losses++
			b.Points += 3
		}
	}
	out := make([]Standing, 0, len(rows))
	for _, row := range rows {
		out = append(out, *row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Points != out[j].Points {
			return out[i].Points > out[j].Points
		}
		if out[i].Wins != out[j].Wins {
			return out[i].Wins > out[j].Wins
		}
		return out[i].Color < out[j].Color
	})
	for i := range out {
		out[i].Position = i + 1
	}
	return out
}
