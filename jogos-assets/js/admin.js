import { GENEROS, STATUS } from "./config.js?v=20260918-json-api";
import { api } from "./api.js?v=20260918-json-api";

const app = document.querySelector("#admin-app");
const toast = document.querySelector("#toast");
let dadosBase;
let usuario;
let modoCorrecao = false;
const filtros = { periodo: "MANHA", dia: "DIA_1", quadra: "QUADRA_1", modalidade: "", genero: "" };
const placaresTemporarios = new Map();

const nomePorId = (colecao, id) => colecao.find((item) => item.id === id)?.nome ?? id;
const equipePorId = (id) => dadosBase.equipes.find((equipe) => equipe.id === id);

function emblemaEquipe(equipe) {
  return `<span class="team-emblem mascot-image ${equipe.sprite}" role="img" aria-label="${equipe.mascote}" title="${equipe.mascote}"></span>`;
}

function avisar(mensagem) {
  toast.textContent = mensagem;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

async function exportarDadosJSON() {
  try {
    const dados = await api.getDadosBase();
    const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    const data = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `placar-jogos-backup-${data}.json`;
    link.click();
    URL.revokeObjectURL(url);
    avisar("Backup JSON exportado com sucesso.");
  } catch (erro) {
    avisar(`Não foi possível exportar: ${erro.message}`);
  }
}

function grupoFiltro(titulo, chave, itens) {
  return `<fieldset class="filter-group"><legend>${titulo}</legend><div class="segmented" data-filter="${chave}">
    ${itens.map((item) => `<button type="button" class="segment ${filtros[chave] === item.id ? "active" : ""}" data-value="${item.id}" aria-pressed="${filtros[chave] === item.id}">${item.nome}</button>`).join("")}
  </div></fieldset>`;
}

function scoreControl(partida, lado, bloqueado) {
  const chave = `${partida.id}:${lado}`;
  const salvo = lado === "A" ? partida.placarA : partida.placarB;
  const valor = placaresTemporarios.has(chave) ? placaresTemporarios.get(chave) : salvo;
  return `<div class="score-control" aria-label="Placar da equipe ${lado}">
    <button type="button" data-step="-1" data-id="${partida.id}" data-side="${lado}" ${bloqueado ? "disabled" : ""} aria-label="Diminuir placar">−</button>
    <output id="score-${partida.id}-${lado}">${valor}</output>
    <button type="button" data-step="1" data-id="${partida.id}" data-side="${lado}" ${bloqueado ? "disabled" : ""} aria-label="Aumentar placar">+</button>
  </div>`;
}

function nomeEquipe(equipe, venceu) {
  return `<span class="admin-team-name ${venceu ? "winner" : ""}">${emblemaEquipe(equipe)}<span><strong>${equipe.cor}</strong><small>${equipe.mascote}</small></span></span>`;
}

function cardPartida(partida, destaque) {
  const equipeA = equipePorId(partida.equipeAId);
  const equipeB = equipePorId(partida.equipeBId);
  const finalizada = partida.status === STATUS.finalizado;
  const bloqueado = finalizada && !modoCorrecao;
  const venceuA = finalizada && partida.placarA > partida.placarB;
  const venceuB = finalizada && partida.placarB > partida.placarA;
  const atual = destaque === "ATUAL";
  const proximo = destaque === "PROXIMO";
  return `<article class="match-card ${atual ? "current-match" : proximo ? "next-match" : ""} ${finalizada ? "finished" : ""} ${modoCorrecao && finalizada ? "editing" : ""}" data-match="${partida.id}">
    <div class="match-top"><div><time>${partida.horario}</time><span class="sport-pill">${nomePorId(dadosBase.modalidades, partida.modalidadeId)}</span></div><div class="match-labels">${atual ? '<span class="current-badge">Jogo Acontecendo</span>' : proximo ? '<span class="current-badge next-badge">Próximo jogo</span>' : ""}<span class="gender-label">${partida.genero === "MASCULINO" ? "Masculino" : "Feminino"}</span></div></div>
    <div class="match-score-row">
      <div class="admin-team">${nomeEquipe(equipeA, venceuA)}${scoreControl(partida, "A", bloqueado)}</div>
      <span class="versus">×</span>
      <div class="admin-team">${nomeEquipe(equipeB, venceuB)}${scoreControl(partida, "B", bloqueado)}</div>
    </div>
    <div class="match-actions"><span class="status ${finalizada ? "done" : atual || partida.status === "EM_ANDAMENTO" ? "live" : "waiting"}">${finalizada ? "Finalizada" : atual || partida.status === "EM_ANDAMENTO" ? "Em andamento" : "Aguardando"}</span>
      <button class="save-button" data-save="${partida.id}" ${bloqueado ? "disabled" : ""}>${bloqueado ? "Salvo" : finalizada ? "Atualizar" : "Salvar"}</button>
    </div>
  </article>`;
}

function linhaClassificacao(item) {
  const branco = item.cor === "Branco" ? " white-team" : "";
  return `<tr class="team-row${branco}" style="--team-color:${item.hex}">
    <td class="position"><strong>${item.posicao}º</strong></td>
    <td><span class="team-ident">${emblemaEquipe(item)}<span class="team-name"><strong>${item.cor}</strong><small>${item.mascote}</small></span></span></td>
    <td><strong>${item.pontos}</strong></td><td>${item.jogos}</td><td>${item.vitorias}</td><td>${item.empates}</td><td>${item.derrotas}</td>
  </tr>`;
}

async function renderClassificacaoAdmin() {
  const classificacao = await api.getClassificacao(filtros.periodo, GENEROS.geral);
  const periodoNome = nomePorId(dadosBase.periodos, filtros.periodo);
  const area = document.querySelector("#admin-ranking");
  if (!area) return;
  area.innerHTML = `<div class="admin-ranking-heading">
      <div><p class="eyebrow blue">Acompanhamento</p><h2>Placar geral</h2></div>
      <span class="period-badge">Período: ${periodoNome}</span>
    </div>
    <div class="panel ranking-panel"><div class="table-wrap"><table class="ranking-table">
      <thead><tr><th>Posição</th><th>Cor</th><th title="Pontos">P</th><th title="Jogos">J</th><th title="Vitórias">V</th><th title="Empates">E</th><th title="Derrotas">D</th></tr></thead>
      <tbody>${classificacao.map(linhaClassificacao).join("")}</tbody>
    </table></div></div>`;
}

async function renderPartidas() {
  const partidas = await api.getPartidas(filtros.periodo, filtros.dia, filtros.quadra, filtros.modalidade, filtros.genero);
  const prioridadeStatus = { EM_ANDAMENTO: 0, AGUARDANDO: 1, FINALIZADO: 2, CANCELADO: 3 };
  partidas.sort((a, b) => {
    const prioridadeA = prioridadeStatus[a.status] ?? 1;
    const prioridadeB = prioridadeStatus[b.status] ?? 1;
    return prioridadeA - prioridadeB || a.ordem - b.ordem || a.horario.localeCompare(b.horario);
  });
  const jogoDaVez = partidas.find((partida) => partida.status === "EM_ANDAMENTO")
    ?? partidas.find((partida) => partida.status === STATUS.aguardando);
  const ativas = partidas.filter((partida) => ![STATUS.finalizado, STATUS.cancelado].includes(partida.status));
  const proximoJogo = ativas.find((partida) => partida.id !== jogoDaVez?.id);
  const nomeQuadra = nomePorId(dadosBase.quadras, filtros.quadra);
  document.querySelector("#matches-area").innerHTML = `<div class="matches-heading">
    <div class="selected-court-title"><p class="eyebrow blue">Quadra selecionada</p><h2>${nomeQuadra}</h2></div>
    <div class="selection-summary"><span>Período: ${nomePorId(dadosBase.periodos, filtros.periodo)}</span><span>${nomePorId(dadosBase.dias, filtros.dia)}</span><span>${filtros.modalidade ? nomePorId(dadosBase.modalidades, filtros.modalidade) : "Todas as modalidades"}</span><span>${filtros.genero === "MASCULINO" ? "Masculino" : filtros.genero === "FEMININO" ? "Feminino" : "Todos os gêneros"}</span><span>${partidas.length} partidas</span></div>
  </div><div class="matches-list">${partidas.map((partida) => cardPartida(partida, partida.id === jogoDaVez?.id ? "ATUAL" : partida.id === proximoJogo?.id ? "PROXIMO" : null)).join("")}</div>`;
  bindPartidas();
}

function bindPartidas() {
  document.querySelectorAll("[data-step]").forEach((botao) => {
    if (botao.dataset.jogosBound === "true") return;
    botao.dataset.jogosBound = "true";
    botao.addEventListener("click", () => {
    const chave = `${botao.dataset.id}:${botao.dataset.side}`;
    const output = document.querySelector(`#score-${botao.dataset.id}-${botao.dataset.side}`);
    const novo = Math.max(0, Number(output.value || output.textContent) + Number(botao.dataset.step));
    placaresTemporarios.set(chave, novo);
    output.textContent = novo;
    });
  });
  document.querySelectorAll("[data-save]").forEach((botao) => {
    if (botao.dataset.jogosBound === "true") return;
    botao.dataset.jogosBound = "true";
    botao.addEventListener("click", async () => {
    const id = botao.dataset.save;
    const partida = (await api.getPartidas(filtros.periodo, filtros.dia, filtros.quadra, filtros.modalidade, filtros.genero)).find((item) => item.id === id);
    const placarA = Number(document.querySelector(`#score-${id}-A`).textContent);
    const placarB = Number(document.querySelector(`#score-${id}-B`).textContent);
    try {
      if (partida.status === STATUS.finalizado) await api.editarResultado(id, placarA, placarB);
      else await api.salvarResultado(id, placarA, placarB);
      placaresTemporarios.delete(`${id}:A`);
      placaresTemporarios.delete(`${id}:B`);
      dadosBase = await api.getDadosBase();
      await renderPartidas();
      await renderClassificacaoAdmin();
      avisar(partida.status === STATUS.finalizado ? "Resultado atualizado e registrado no log." : "Resultado salvo com sucesso.");
    } catch (erro) {
      avisar(erro.message);
    }
    });
  });
}

window.__jogosAdminRebindPartidas = bindPartidas;

function bindFiltros() {
  document.querySelectorAll("[data-filter] [data-value]").forEach((botao) => botao.addEventListener("click", async () => {
    const chave = botao.closest("[data-filter]").dataset.filter;
    filtros[chave] = botao.dataset.value;
    if (chave === "quadra") {
      const modalidadesDaQuadra = dadosBase.modalidades.filter((item) => item.quadraId === filtros.quadra).map((item) => item.id);
      if (filtros.modalidade && !modalidadesDaQuadra.includes(filtros.modalidade)) filtros.modalidade = "";
      placaresTemporarios.clear();
      await iniciar();
      return;
    }
    if (chave === "modalidade") {
      placaresTemporarios.clear();
      await iniciar();
      return;
    }
    placaresTemporarios.clear();
    document.querySelectorAll(`[data-filter="${chave}"] [data-value]`).forEach((item) => {
      const ativo = item.dataset.value === filtros[chave];
      item.classList.toggle("active", ativo);
      item.setAttribute("aria-pressed", String(ativo));
    });
    await Promise.all([renderPartidas(), renderClassificacaoAdmin()]);
  }));
}

async function iniciar() {
  [dadosBase, usuario] = await Promise.all([api.getDadosBase(), api.getUsuarioAtual()]);
  const headerAtual = document.querySelector(".admin-header");
  if (headerAtual && !document.body.classList.contains("integrated-admin")) {
    headerAtual.outerHTML = `<div class="public-topbar"><div><strong>JOGOS INFANTIS DE UMUARAMA 2026</strong><strong>PLACAR OFICIAL</strong></div></div><header id="admin-header" class="site-header public-header admin-header"><div class="header-inner"><div class="public-brand"><a class="header-home" href="/jogos">Início</a></div><a class="admin-button" href="/jogos#admin">Área administrativa</a></div></header>`;
    const novoHeader = document.querySelector("#admin-header");
    if (novoHeader) { novoHeader.classList.add("admin-header"); novoHeader.id = "admin-header"; }
    const filtroFlutuante = document.querySelector("#admin-filter-toggle");
    if (filtroFlutuante) {
      const menuAdmin = document.createElement("nav");
      menuAdmin.className = "admin-bottom-nav";
      menuAdmin.innerHTML = `<button type="button" class="admin-ranking-menu-item"><span class="admin-menu-icon" aria-hidden="true">▥</span><span>Ver placar</span></button>`;
      const verPlacar = menuAdmin.querySelector(".admin-ranking-menu-item");
      verPlacar.onclick = () => {
        const antigo = document.querySelector(".admin-ranking-modal");
        if (antigo) antigo.remove();
        const modal = document.createElement("div");
        modal.className = "admin-ranking-modal";
        modal.innerHTML = `<div class="admin-ranking-backdrop"></div><section class="admin-ranking-sheet" role="dialog" aria-modal="true" aria-label="Placar geral"><div class="admin-ranking-sheet-head"><h2>Placar geral</h2></div><div class="admin-ranking-sheet-body">${document.querySelector("#admin-ranking")?.innerHTML || ""}</div><button type="button" class="admin-ranking-back">Voltar</button></section>`;
        document.body.appendChild(modal);
        modal.querySelector(".admin-ranking-back").onclick = () => modal.remove();
        modal.querySelector(".admin-ranking-backdrop").onclick = () => modal.remove();
      };
      const itemFiltro = document.createElement("button");
      itemFiltro.type = "button";
      itemFiltro.className = "admin-filter-menu-item";
      itemFiltro.setAttribute("aria-label", "Abrir filtros");
      itemFiltro.innerHTML = `<span class="filter-icon" aria-hidden="true">${filtroFlutuante.innerHTML}</span><span>Filtros</span>`;
      itemFiltro.onclick = () => {
        const aberto = document.body.classList.toggle("admin-filters-open");
        itemFiltro.classList.toggle("active", aberto);
        itemFiltro.setAttribute("aria-label", aberto ? "Fechar filtros" : "Abrir filtros");
      };
      menuAdmin.prepend(itemFiltro);
      document.body.appendChild(menuAdmin);
      filtroFlutuante.remove();
    }
  }
  app.innerHTML = `<section class="admin-intro"><h2>Registro de Resultados</h2></section><section class="panel filters-panel">
      ${grupoFiltro("Período", "periodo", dadosBase.periodos)}
      ${grupoFiltro("Dia", "dia", dadosBase.dias)}
      ${grupoFiltro("Quadra", "quadra", dadosBase.quadras)}
      ${grupoFiltro("Modalidade", "modalidade", [{ id: "", nome: "Todas" }, ...dadosBase.modalidades.filter((item) => item.quadraId === filtros.quadra)])}
      ${grupoFiltro("Gênero", "genero", [
        { id: "", nome: "Todos" },
        { id: "FEMININO", nome: "Feminino" },
        { id: "MASCULINO", nome: "Masculino" },
      ])}
      <div class="admin-filter-actions"><button type="button" class="admin-filter-confirm" id="admin-filter-confirm">Confirmar</button></div>
    </section>
    <section id="matches-area" class="matches-area"></section>
    <section id="admin-ranking" class="admin-ranking-section" aria-label="Placar geral do período"></section>
    <section class="correction-panel ${modoCorrecao ? "active" : ""}">
      <div><p class="eyebrow">Acesso restrito</p><h2>Correção de resultados</h2><p>Disponível apenas para ${usuario.email}</p></div>
      <button id="toggle-correcao" class="correction-button">${modoCorrecao ? "Bloquear novamente" : "Editar resultados finalizados"}</button>
    </section>`;
  const filtroMobile = document.querySelector("#admin-filter-toggle");
  if (filtroMobile) filtroMobile.onclick = () => {
    const aberto = document.body.classList.toggle("admin-filters-open");
    filtroMobile.setAttribute("aria-expanded", String(aberto));
    filtroMobile.setAttribute("aria-label", aberto ? "Fechar filtros" : "Abrir filtros");
  };
  const confirmarFiltros = document.querySelector("#admin-filter-confirm");
  if (confirmarFiltros) confirmarFiltros.onclick = () => {
    document.body.classList.remove("admin-filters-open");
    filtroMobile?.setAttribute("aria-expanded", "false");
    filtroMobile?.setAttribute("aria-label", "Abrir filtros");
  };
  const exportar = document.querySelector("#exportar-json");
  if (exportar) exportar.onclick = exportarDadosJSON;
  bindFiltros();
  document.querySelector("#toggle-correcao").addEventListener("click", async () => {
    modoCorrecao = !modoCorrecao;
    placaresTemporarios.clear();
    await iniciar();
    avisar(modoCorrecao ? "Modo de correção ativado. Alterações serão registradas." : "Resultados finalizados protegidos novamente.");
  });
  await Promise.all([renderPartidas(), renderClassificacaoAdmin()]);
}

iniciar();
