import { CONFIG, STATUS } from "./config.js?v=20260918-json-api";
import { dadosIniciais } from "./data.js?v=20260918-json-api";
import { calcularClassificacao } from "./ranking.js?v=20260918-json-api";

const usandoAppsScript = typeof google !== "undefined" && Boolean(google.script?.run);

function chamarServidor(funcao, ...argumentos) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((erro) => reject(new Error(erro?.message ?? String(erro))))
      [funcao](...argumentos);
  });
}

function clonar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

function carregarLocal() {
  try {
    const salvo = localStorage.getItem(CONFIG.storageKey);
    return salvo ? JSON.parse(salvo) : clonar(dadosIniciais);
  } catch {
    return clonar(dadosIniciais);
  }
}

async function carregar() {
  return carregarLocal();
}

async function persistir(dados) {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(dados));
  window.dispatchEvent(new CustomEvent("jogos:atualizado"));
}

function buscarPartida(dados, partidaId) {
  const partida = dados.partidas.find((item) => item.id === partidaId);
  if (!partida) throw new Error("Partida não encontrada.");
  return partida;
}

function registrarLog(dados, acao, partida, antes, depois) {
  dados.logs.push({
    dataHora: new Date().toISOString(),
    usuario: CONFIG.adminEmail,
    acao,
    partidaId: partida.id,
    antes,
    depois,
  });
}

export const api = {
  async getDadosBase() {
    if (usandoAppsScript) return chamarServidor("apiGetDadosBase");
    return carregar();
  },
  async getPlacar(periodo, limite = 6) {
    if (usandoAppsScript) return chamarServidor("apiGetPlacar", periodo, limite);
    const dados = await carregar();
    return {
      ranking: calcularClassificacao(dados, periodo, "GERAL"),
      resultados: dados.partidas
        .filter((partida) => partida.periodo === periodo && partida.status === STATUS.finalizado)
        .sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm))
        .slice(0, limite),
    };
  },
  async getCronograma(periodo, dia) {
    if (usandoAppsScript) return chamarServidor("apiGetCronograma", periodo, dia);
    return (await carregar()).partidas
      .filter((partida) => partida.periodo === periodo && partida.dia === dia)
      .sort((a, b) => String(a.quadra).localeCompare(String(b.quadra)) || String(a.horario).localeCompare(String(b.horario)) || a.ordem - b.ordem);
  },
  async getClassificacao(periodo, genero) {
    if (usandoAppsScript) return chamarServidor("apiGetClassificacao", periodo, genero);
    return calcularClassificacao(await carregar(), periodo, genero);
  },
  async getUltimosResultados(periodo, limite = 6) {
    if (usandoAppsScript) return chamarServidor("apiGetUltimosResultados", periodo, limite);
    const dados = await carregar();
    return dados.partidas
      .filter((partida) => partida.periodo === periodo && partida.status === STATUS.finalizado)
      .sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm))
      .slice(0, limite);
  },
  async getPartidas(periodo, dia, quadra, modalidadeId, genero) {
    if (usandoAppsScript) return chamarServidor("apiGetPartidas", periodo, dia, quadra, modalidadeId, genero);
    return (await carregar()).partidas
      .filter((partida) => partida.periodo === periodo && partida.dia === dia && partida.quadra === quadra)
      .filter((partida) => !modalidadeId || partida.modalidadeId === modalidadeId)
      .filter((partida) => !genero || partida.genero === genero)
      .sort((a, b) => a.ordem - b.ordem);
  },
  async salvarResultado(partidaId, placarA, placarB) {
    if (usandoAppsScript) return chamarServidor("apiSalvarResultado", partidaId, placarA, placarB);
    const dados = await carregar();
    const partida = buscarPartida(dados, partidaId);
    if (partida.status === STATUS.finalizado) throw new Error("Este resultado já está protegido.");
    const antes = `${partida.placarA}x${partida.placarB} (${partida.status})`;
    Object.assign(partida, { placarA, placarB, status: STATUS.finalizado, atualizadoEm: new Date().toISOString() });
    registrarLog(dados, "SALVAR_RESULTADO", partida, antes, `${placarA}x${placarB} (${STATUS.finalizado})`);
    await persistir(dados);
    return clonar(partida);
  },
  async editarResultado(partidaId, placarA, placarB) {
    if (usandoAppsScript) return chamarServidor("apiEditarResultado", partidaId, placarA, placarB);
    const dados = await carregar();
    const partida = buscarPartida(dados, partidaId);
    const antes = `${partida.placarA}x${partida.placarB}`;
    Object.assign(partida, { placarA, placarB, status: STATUS.finalizado, atualizadoEm: new Date().toISOString() });
    registrarLog(dados, "ALTERAR_RESULTADO", partida, antes, `${placarA}x${placarB}`);
    await persistir(dados);
    return clonar(partida);
  },
  async getUsuarioAtual() {
    if (usandoAppsScript) return chamarServidor("apiGetUsuarioAtual");
    return { email: CONFIG.adminEmail, nome: "Educação Física", perfil: "ADMIN", ativo: true };
  },
};
