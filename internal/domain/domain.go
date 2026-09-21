package domain

import (
	_ "embed"
	"encoding/json"
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

// competition_data.json contém as equipes e o cronograma oficial dos três dias.
//go:embed competition_data.json
var competitionDataJSON []byte

type competitionSeedData struct {
	Teams   []Team  `json:"teams"`
	Matches []Match `json:"matches"`
}

var competitionSeed = mustLoadCompetitionSeed()

func mustLoadCompetitionSeed() competitionSeedData {
	var data competitionSeedData
	if err := json.Unmarshal(competitionDataJSON, &data); err != nil {
		panic("dados da competição inválidos: " + err.Error())
	}
	return data
}

func SeedTeams() []Team {
	return append([]Team(nil), competitionSeed.Teams...)
}

func SeedMatches() []Match {
	return append([]Match(nil), competitionSeed.Matches...)
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
