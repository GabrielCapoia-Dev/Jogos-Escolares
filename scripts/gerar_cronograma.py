"""Gera o cronograma de 10 equipes por período com uma troca de ginásio.

O sorteio usa uma semente fixa para que o arquivo oficial seja reproduzível.
Cada grupo de cinco equipes faz cinco horários em um ginásio e depois troca.
Em cada horário ocorrem dois jogos, um por modalidade, com uma equipe de folga.
"""

import copy
import json
import random
from collections import Counter, defaultdict
from pathlib import Path


ARQUIVO = Path(__file__).resolve().parents[1] / "internal/domain/competition_data.json"
SEMENTE = 20261001
MODALIDADES = {"QUADRA_1": ("FUTSAL", "PETECA"), "QUADRA_2": ("BASQUETE", "CORRIDA")}
GENEROS = ("MASCULINO", "FEMININO")
DIAS = ("DIA_1", "DIA_2", "DIA_3")
PERIODOS = ("MANHA", "TARDE")


def gerar(dados):
    sorteio = random.Random(SEMENTE)
    permutacoes = {}
    equipes = [e for e in dados["teams"] if not e["id"].endswith("_PRETO")]
    tartaruga = next(e for e in equipes if e["id"] == "MANHA_AZUL_CLARO")
    tartaruga_tarde = copy.deepcopy(tartaruga)
    tartaruga_tarde.update(id="TARDE_AZUL_CLARO", period="TARDE")
    if not any(e["id"] == tartaruga_tarde["id"] for e in equipes):
        equipes.append(tartaruga_tarde)

    horarios = {}
    estacoes = {}
    for partida in dados["matches"]:
        chave = (partida["period"], partida["court"])
        horarios.setdefault(chave, set()).add(partida["time"])
        estacoes[(partida["court"], partida["sportId"], partida["gender"])] = partida["stationId"]
    horarios = {chave: sorted(valores)[:10] for chave, valores in horarios.items()}

    # Dois ciclos de cinco adversários: em cada horário as duplas não se cruzam.
    pares = (
        (((0, 1), (2, 4)), ((1, 2), (3, 0)), ((2, 3), (4, 1)),
         ((3, 4), (0, 2)), ((4, 0), (1, 3)))
    )
    partidas = []
    for periodo in PERIODOS:
        ids = sorted(e["id"] for e in equipes if e["period"] == periodo)
        assert len(ids) == 10
        for dia in DIAS:
            sorteio.shuffle(ids)
            grupos = (ids[:5], ids[5:])
            for quadra, modalidades in MODALIDADES.items():
                for modalidade in modalidades:
                    for genero in GENEROS:
                        for indice, horario in enumerate(horarios[(periodo, quadra)]):
                            fase = indice // 5
                            grupo = grupos[(quadra == "QUADRA_2") ^ bool(fase)]
                            # A ordem dos participantes muda entre gênero, quadra e fase.
                            chave_permutacao = (periodo, dia, quadra, genero, fase)
                            if chave_permutacao not in permutacoes:
                                permutacoes[chave_permutacao] = sorteio.sample(grupo, len(grupo))
                            ordem_equipes = permutacoes[chave_permutacao]
                            indice_modalidade = modalidades.index(modalidade)
                            a, b = pares[indice % 5][indice_modalidade]
                            partidas.append({
                                "id": f"PARTIDA_{len(partidas) + 1:03}",
                                "period": periodo, "day": dia, "court": quadra,
                                "time": horario, "sportId": modalidade, "gender": genero,
                                "teamAId": ordem_equipes[a], "teamBId": ordem_equipes[b],
                                "status": "AGUARDANDO",
                                "stationId": estacoes[(quadra, modalidade, genero)],
                                "order": indice + 1, "scoreA": 0, "scoreB": 0,
                            })
    return {"teams": equipes, "matches": partidas}


def validar(dados):
    assert len(dados["teams"]) == 20 and len(dados["matches"]) == 480
    equipes = {e["id"]: e for e in dados["teams"]}
    faixas = Counter()
    jogos = defaultdict(list)
    for partida in dados["matches"]:
        assert partida["teamAId"] != partida["teamBId"]
        faixa = tuple(partida[k] for k in ("period", "day", "court", "sportId", "gender"))
        faixas[faixa] += 1
        for equipe, adversario in ((partida["teamAId"], partida["teamBId"]),
                                    (partida["teamBId"], partida["teamAId"])):
            assert equipes[equipe]["period"] == partida["period"]
            jogos[(equipe, partida["day"], partida["gender"])].append(
                (partida["time"], partida["court"], partida["sportId"], adversario)
            )
    assert len(faixas) == 48 and set(faixas.values()) == {10}
    assert len(jogos) == 120
    for chave, partidas in jogos.items():
        partidas.sort()
        assert len(partidas) == 8, chave
        assert len({p[0] for p in partidas}) == 8, chave
        assert Counter(p[1] for p in partidas) == {"QUADRA_1": 4, "QUADRA_2": 4}, chave
        assert sum(partidas[i][1] != partidas[i - 1][1] for i in range(1, 8)) == 1, chave
        assert Counter(p[2] for p in partidas) == Counter({s: 2 for sports in MODALIDADES.values() for s in sports}), chave
        assert len({(p[2], p[3]) for p in partidas}) == 8, chave


if __name__ == "__main__":
    origem = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    resultado = gerar(origem)
    validar(resultado)
    ARQUIVO.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(resultado['teams'])} equipes; {len(resultado['matches'])} partidas")
