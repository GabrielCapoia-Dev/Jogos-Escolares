import { CONFIG, GENEROS, STATUS } from "./config.js?v=20260918-json-api";

function criarLinha(equipe) {
  return { equipeId: equipe.id, cor: equipe.cor, hex: equipe.hex, mascote: equipe.mascote, sprite: equipe.sprite, pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0 };
}

function aplicarResultado(linhaA, linhaB, placarA, placarB) {
  linhaA.jogos += 1;
  linhaB.jogos += 1;
  if (placarA === placarB) {
    linhaA.empates += 1;
    linhaB.empates += 1;
    linhaA.pontos += CONFIG.pontos.empate;
    linhaB.pontos += CONFIG.pontos.empate;
    return;
  }
  const vencedora = placarA > placarB ? linhaA : linhaB;
  const derrotada = placarA > placarB ? linhaB : linhaA;
  vencedora.vitorias += 1;
  derrotada.derrotas += 1;
  vencedora.pontos += CONFIG.pontos.vitoria;
  derrotada.pontos += CONFIG.pontos.derrota;
}

function comparar(a, b) {
  for (const criterio of CONFIG.criteriosDesempate) {
    if (criterio === "pontos" && a.pontos !== b.pontos) return b.pontos - a.pontos;
    if (criterio === "vitorias" && a.vitorias !== b.vitorias) return b.vitorias - a.vitorias;
    if (criterio === "empates" && a.empates !== b.empates) return b.empates - a.empates;
    if (criterio === "menosDerrotas" && a.derrotas !== b.derrotas) return a.derrotas - b.derrotas;
  }
  return a.cor.localeCompare(b.cor, "pt-BR");
}

export function calcularClassificacao(dados, periodo, genero = GENEROS.geral) {
  const equipesPeriodo = dados.equipes.filter((equipe) => equipe.periodo === periodo && equipe.ativo);
  const linhas = new Map(equipesPeriodo.map((equipe) => [equipe.id, criarLinha(equipe)]));
  dados.partidas
    .filter((partida) => partida.periodo === periodo && partida.status === STATUS.finalizado)
    .filter((partida) => genero === GENEROS.geral || partida.genero === genero)
    .forEach((partida) => {
      const linhaA = linhas.get(partida.equipeAId);
      const linhaB = linhas.get(partida.equipeBId);
      if (linhaA && linhaB) aplicarResultado(linhaA, linhaB, Number(partida.placarA), Number(partida.placarB));
    });
  const ordenadas = [...linhas.values()].sort(comparar);
  ordenadas.forEach((linha, indice) => {
    linha.posicao = indice + 1;
    const anterior = ordenadas[indice - 1];
    if (!anterior || anterior.pontos !== linha.pontos) return;
    if (anterior.vitorias !== linha.vitorias) anterior.criterioDesempate = linha.criterioDesempate = "Vitórias";
    else if (anterior.empates !== linha.empates) anterior.criterioDesempate = linha.criterioDesempate = "Empates";
    else if (anterior.derrotas !== linha.derrotas) anterior.criterioDesempate = linha.criterioDesempate = "Menos derrotas";
    else {
      if (anterior.jogos === 0 && linha.jogos === 0) return;
      anterior.empateMoeda = linha.empateMoeda = true;
      linha.posicao = anterior.posicao;
    }
  });
  return ordenadas;
}
