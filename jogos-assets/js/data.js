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
  ["LARANJA", "Laranja", "#EF8615", "Mico-leão", "mascote-laranja"],
  ["VERMELHO", "Vermelho", "#D84247", "Lobo-guará", "mascote-vermelho"],
  ["MARROM", "Roxo", "#8E44AD", "Capivara", "mascote-marrom"],
  ["BRANCO", "Branco", "#F7F7F2", "Tamanduá", "mascote-branco"],
  ["CINZA", "Cinza", "#8D9AA6", "Quati", "mascote-cinza"],
  ["VERDE_CLARO", "Verde-claro", "#31BD75", "Maritaca", "mascote-verde-claro"],
  ["VERDE_ESCURO", "Verde-escuro", "#087D4B", "Jacaré", "mascote-verde-escuro"],
  ["AZUL_ESCURO", "Azul-escuro", "#0753A4", "Arara-azul", "mascote-azul-escuro"],
  ["AZUL_CLARO", "Azul-claro", "#35ACE0", "Tartaruga", "mascote-azul-claro"],
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
  ...criarEquipes("MANHA", 10),
  ...criarEquipes("TARDE", 10),
];

function criarPartidas() {
  const lista = [];
  let semente = 20261001;
  const aleatorio = () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0;
    return semente / 4294967296;
  };
  const sortear = (itens) => {
    const copia = [...itens];
    for (let i = copia.length - 1; i > 0; i -= 1) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  };
  const duplas = [
    [[0, 1], [2, 4]], [[1, 2], [3, 0]], [[2, 3], [4, 1]],
    [[3, 4], [0, 2]], [[4, 0], [1, 3]],
  ];
  const horarios = {
    MANHA: {
      QUADRA_1: ["08:30", "08:42", "08:54", "09:06", "09:18", "09:42", "09:54", "10:06", "10:18", "10:30"],
      QUADRA_2: ["08:30", "08:42", "08:54", "09:06", "09:18", "09:36", "09:48", "10:00", "10:12", "10:24"],
    },
    TARDE: {
      QUADRA_1: ["13:30", "13:42", "13:54", "14:06", "14:18", "14:36", "14:48", "15:00", "15:12", "15:24"],
      QUADRA_2: ["13:30", "13:42", "13:54", "14:06", "14:18", "14:36", "14:48", "15:00", "15:12", "15:24"],
    },
  };
  periodos.forEach((periodo) => {
    const times = equipes.filter((equipe) => equipe.periodo === periodo.id);
    dias.forEach((dia) => {
      const sorteados = sortear(times);
      const grupos = [sorteados.slice(0, 5), sorteados.slice(5)];
      const ordens = new Map();
      estacoes.forEach((estacao) => {
        const modalidade = modalidades.find((item) => item.id === estacao.modalidadeId);
        const indiceModalidade = CONFIG.modalidadesPorQuadra[estacao.quadraId].indexOf(estacao.modalidadeId);
        for (let ordem = 0; ordem < 10; ordem += 1) {
          const fase = Math.floor(ordem / 5);
          const grupo = grupos[(estacao.quadraId === "QUADRA_2" ? 1 : 0) ^ fase];
          const chave = `${estacao.quadraId}-${estacao.genero}-${fase}`;
          if (!ordens.has(chave)) ordens.set(chave, sortear(grupo));
          const [a, b] = duplas[ordem % 5][indiceModalidade];
          const equipeA = ordens.get(chave)[a];
          const equipeB = ordens.get(chave)[b];
          lista.push({
            id: `PARTIDA_${String(lista.length + 1).padStart(3, "0")}`,
            periodo: periodo.id,
            dia: dia.id,
            quadra: estacao.quadraId,
            horario: horarios[periodo.id][estacao.quadraId][ordem],
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
