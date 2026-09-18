import { CONFIG, STATUS } from "./config.js?v=20260918-json-api";

export const periodos = [
  { id: "MANHA", nome: "Manhã" },
  { id: "TARDE", nome: "Tarde" },
];

export const dias = [
  { id: "DIA_1", nome: "Dia 1" },
  { id: "DIA_2", nome: "Dia 2" },
  { id: "DIA_3", nome: "Dia 3" },
];

export const quadras = [
  { id: "QUADRA_1", nome: "Amário Vieira" },
  { id: "QUADRA_2", nome: "Mario Onken" },
];

export const modalidades = [
  { id: "PETECA", nome: "Peteca", tipo: "PRE_DESPORTIVA", quadraId: "QUADRA_1", inicioPrevisto: "08:30", ativo: true },
  { id: "FUTSAL", nome: "Futsal", tipo: "COLETIVA", quadraId: "QUADRA_1", inicioPrevisto: "08:30", ativo: true },
  { id: "BASQUETE", nome: "Basquete", tipo: "COLETIVA", quadraId: "QUADRA_2", inicioPrevisto: "08:30", ativo: true },
  { id: "CORRIDA", nome: "Corrida", tipo: "REVEZAMENTO", quadraId: "QUADRA_2", inicioPrevisto: "08:30", ativo: true },
];

export const estacoes = CONFIG.estacoes;

const coresBase = [
  ["AMARELO", "Amarelo", "#F3C515", "Onça", "mascote-amarelo"],
  ["LARANJA", "Laranja", "#EF8615", "Mico-leão-dourado", "mascote-laranja"],
  ["VERMELHO", "Vermelho", "#D84247", "Lobo-guará", "mascote-vermelho"],
  ["MARROM", "Marrom", "#986347", "Capivara", "mascote-marrom"],
  ["BRANCO", "Branco", "#F7F7F2", "Tamanduá", "mascote-branco"],
  ["PRETO", "Preto", "#29313B", "Tucano", "mascote-preto"],
  ["CINZA", "Cinza", "#8D9AA6", "Tubarão", "mascote-cinza"],
  ["VERDE_CLARO", "Verde-claro", "#31BD75", "Sapo", "mascote-verde-claro"],
  ["VERDE_ESCURO", "Verde-escuro", "#087D4B", "Jacaré", "mascote-verde-escuro"],
  ["AZUL_ESCURO", "Azul-escuro", "#0753A4", "Arara-azul", "mascote-azul-escuro"],
  ["AZUL_CLARO", "Azul-claro", "#35ACE0", "Boto", "mascote-azul-claro"],
];

function criarEquipes(periodo, quantidade) {
  return coresBase.slice(0, quantidade).map(([codigo, cor, hex, mascote, sprite]) => ({
    id: `${periodo.slice(0, 3)}_${codigo}`,
    periodo,
    cor,
    hex,
    mascote,
    sprite,
    ativo: true,
  }));
}

export const equipes = [
  ...criarEquipes("MANHA", 11),
  ...criarEquipes("TARDE", 10),
];

function criarPartidas() {
  const lista = [];
  periodos.forEach((periodo) => {
    const times = equipes.filter((equipe) => equipe.periodo === periodo.id);
    dias.forEach((dia, indiceDia) => {
      estacoes.forEach((estacao, indiceEstacao) => {
        const passo = times.length === 11 ? 5 : 3;
        const deslocamento = (indiceDia * 3 + indiceEstacao * 2) % times.length;
        const ciclo = times.map((_, indice) => times[(deslocamento + indice * passo) % times.length]);
        for (let ordem = 0; ordem < times.length; ordem += 1) {
          const equipeA = ciclo[ordem];
          const equipeB = ciclo[(ordem + 1) % ciclo.length];
          const modalidade = modalidades.find((item) => item.id === estacao.modalidadeId);
          const minutosInicio = 8 * 60 + 30 + ordem * 13;
          const hora = Math.floor(minutosInicio / 60);
          const minuto = minutosInicio % 60;
          lista.push({
            id: `PARTIDA_${String(lista.length + 1).padStart(3, "0")}`,
            periodo: periodo.id,
            dia: dia.id,
            quadra: estacao.quadraId,
            horario: `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`,
            modalidadeId: modalidade.id,
            genero: estacao.genero,
            equipeAId: equipeA.id,
            equipeBId: equipeB.id,
            status: STATUS.aguardando,
            ordem: ordem + 1,
            placarA: 0,
            placarB: 0,
            atualizadoEm: null,
            estacaoId: estacao.id,
          });
        }
      });
    });
  });
  return lista;
}

export const dadosIniciais = Object.freeze({
  config: CONFIG,
  periodos,
  dias,
  quadras,
  modalidades,
  estacoes,
  equipes,
  partidas: criarPartidas(),
  logs: [],
});
