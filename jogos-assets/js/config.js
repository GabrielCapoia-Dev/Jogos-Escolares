export const CONFIG = Object.freeze({
  ano: 2026,
  pontos: Object.freeze({ vitoria: 3, empate: 1, derrota: 0 }),
  adminEmail: "educacaofisica@edu.umuarama.pr.gov.br",
  atualizacaoPublicaSegundos: 10,
  horarioInicial: "08:30",
  horarioInicialTarde: "13:30",
  duracaoJogoMinutos: 8,
  intervaloEntreJogosMinutos: 3,
  intervaloEntreJogosMinimo: 2,
  intervaloEntreJogosMaximo: 5,
  quantidadeEquipesPorPeriodo: Object.freeze({ MANHA: 11, TARDE: 10 }),
  participacoesPorModalidadeGenero: 2,
  modalidadesPorQuadra: Object.freeze({
    QUADRA_1: Object.freeze(["PETECA", "FUTSAL"]),
    QUADRA_2: Object.freeze(["BASQUETE", "CORRIDA"]),
  }),
  estacoes: Object.freeze([
    Object.freeze({ id: "AMARIO_PETECA_FEM", quadraId: "QUADRA_1", modalidadeId: "PETECA", genero: "FEMININO", nome: "Peteca feminino", ordem: 1 }),
    Object.freeze({ id: "AMARIO_FUTSAL_MASC", quadraId: "QUADRA_1", modalidadeId: "FUTSAL", genero: "MASCULINO", nome: "Futsal masculino", ordem: 2 }),
    Object.freeze({ id: "AMARIO_FUTSAL_FEM", quadraId: "QUADRA_1", modalidadeId: "FUTSAL", genero: "FEMININO", nome: "Futsal feminino", ordem: 3 }),
    Object.freeze({ id: "AMARIO_PETECA_MASC", quadraId: "QUADRA_1", modalidadeId: "PETECA", genero: "MASCULINO", nome: "Peteca masculino", ordem: 4 }),
    Object.freeze({ id: "ONKEN_CORRIDA_FEM", quadraId: "QUADRA_2", modalidadeId: "CORRIDA", genero: "FEMININO", nome: "Corrida feminino", ordem: 1 }),
    Object.freeze({ id: "ONKEN_CORRIDA_MASC", quadraId: "QUADRA_2", modalidadeId: "CORRIDA", genero: "MASCULINO", nome: "Corrida masculino", ordem: 2 }),
    Object.freeze({ id: "ONKEN_BASQUETE_FEM", quadraId: "QUADRA_2", modalidadeId: "BASQUETE", genero: "FEMININO", nome: "Basquete feminino", ordem: 3 }),
    Object.freeze({ id: "ONKEN_BASQUETE_MASC", quadraId: "QUADRA_2", modalidadeId: "BASQUETE", genero: "MASCULINO", nome: "Basquete masculino", ordem: 4 }),
  ]),
  storageKey: "jogos-infantis-umuarama-2026-v3-base-zero",
  criteriosDesempate: Object.freeze(["pontos", "vitorias", "cor"]),
});

export const STATUS = Object.freeze({
  aguardando: "AGUARDANDO",
  emAndamento: "EM_ANDAMENTO",
  finalizado: "FINALIZADO",
  cancelado: "CANCELADO",
});

export const GENEROS = Object.freeze({
  geral: "GERAL",
  masculino: "MASCULINO",
  feminino: "FEMININO",
});
