import { CONFIG } from "./config.js?v=20260918-json-api";
import { api } from "./api.js?v=20260918-json-api";

const app = document.querySelector("#app");
let acessoAdminListenerRegistrado = false;
let periodoAtual = null;
let dadosBase;
let timerAtualizacao;
let visaoAtual = "CLASSIFICACAO";
let diaCronogramaAtual = null;
let quadraCronogramaAtual = null;
let corDestaqueAtual = "";
let modalidadeMobileAtual = null;
let equipeCronogramaAtual = null;
let equipeHistoricoAtual = "";

const nomePorId = (colecao, id) => colecao.find((item) => item.id === id)?.nome ?? id;
const equipePorId = (id) => dadosBase.equipes.find((equipe) => equipe.id === id);

const iconesMenu = {
  geral: '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 4h8v3.5A4 4 0 0 1 12 11.5 4 4 0 0 1 8 7.5V4Z"/><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 11.5V16M9 20h6M10 16h4v4"/></svg>',
  cronograma: '<svg viewBox="0 0 24 24" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M7.5 13h2M12 13h2M16.5 13h.1M7.5 16.5h2M12 16.5h2M16.5 16.5h.1"/></svg>',
  equipes: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10" r="2.25"/><circle cx="18.5" cy="10" r="2.25"/><path d="M6.5 19v-1.5a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4V19M2.5 18v-1a3.25 3.25 0 0 1 3.25-3.25h1.1M21.5 18v-1a3.25 3.25 0 0 0-3.25-3.25h-1.1"/></svg>',
  resultados: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M3 20.5h18"/></svg>',
  filtros: '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 7h4M11 7h10M3 12h10M17 12h4M3 17h6M13 17h8"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="17" r="2"/></svg>',
};

const simbolosEquipe = {
  AZUL: '<polygon points="12,2 15,8.5 22,9.3 17,14.1 18.5,21 12,17.5 5.5,21 7,14.1 2,9.3 9,8.5"/>',
  VERDE: '<path d="M20.5 3.5C12 3 5.2 7.2 4.5 14.2c-.3 3.4 2 5.8 5.2 5.8 7 0 10.7-8.2 10.8-16.5ZM5.2 19c3.5-5.1 7.2-8.4 11.8-11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  AMARELO: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8M16.6 16.6l2.8 2.8M19.4 4.6l-2.8 2.8M7.4 16.6l-2.8 2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  VERMELHO: '<path d="M13.2 2.2c.7 4.2-2.5 5.4-1.4 8.5 1.2-1.2 2-2.5 2.4-4.1 3.4 2.7 5.1 5.8 3.6 9.5-1.1 2.8-3.2 4.4-6.1 4.4-3.8 0-6.5-2.4-6.5-6.1 0-3.4 2-6.1 4.8-8.5-.1 2 .4 3.3 1.1 4.2.3-3.3-.2-5.4 2.1-7.9Z"/>',
  ROXO: '<polygon points="12,2.5 21,12 12,21.5 3,12"/><polygon points="12,7 16.5,12 12,17 7.5,12" fill="none" stroke="white" stroke-width="1.5"/>',
  BRANCO: '<path d="M18.7 16.8A8.4 8.4 0 0 1 8 5.8a8.8 8.8 0 1 0 10.7 11Z"/>',
  LARANJA: '<polygon points="13.5,1.5 4.5,13 11,13 9.8,22.5 19.5,10.5 13,10.5"/>',
  ROSA: '<path d="M12 21S3 15.4 3 8.7C3 5.4 5.3 3.5 8.1 3.5c1.7 0 3.1.8 3.9 2.1.8-1.3 2.2-2.1 3.9-2.1 2.8 0 5.1 1.9 5.1 5.2C21 15.4 12 21 12 21Z"/>',
  PRETO: '<path d="M12 2.2 20 5v6.1c0 5.2-3.3 8.6-8 10.7-4.7-2.1-8-5.5-8-10.7V5l8-2.8Z"/><path d="m8.2 12 2.4 2.4 5.2-5.2" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  CINZA: '<path d="M12 2.5 14 6l4-.4-.4 4 3.9 2.4-3.9 2.4.4 4-4-.4-2 3.5-2-3.5-4 .4.4-4L2.5 12l3.9-2.4-.4-4 4 .4 2-3.5Z"/><circle cx="12" cy="12" r="3.2" fill="white"/>',
  MARROM: '<path d="M3 18.5 8.2 9l3 4.7 2.4-3.4L21 18.5H3Z"/><circle cx="17.8" cy="6.2" r="2.8"/>',
  TURQUESA: '<path d="M2 9c3.3-3.2 6.7-3.2 10 0s6.7 3.2 10 0v4c-3.3 3.2-6.7 3.2-10 0s-6.7-3.2-10 0V9Zm0 7c3.3-2.5 6.7-2.5 10 0s6.7 2.5 10 0v3c-3.3 2.5-6.7 2.5-10 0s-6.7-2.5-10 0v-3Z"/>',
};

function emblemaEquipe(equipe) {
  return `<span class="team-emblem mascot-image ${equipe.sprite}" role="img" aria-label="${equipe.mascote}" title="${equipe.mascote}"></span>`;
}

function identificacaoEquipe(equipe) {
  return `<span class="fixture-team-copy"><strong>${equipe.cor}</strong><small>${equipe.mascote}</small></span>`;
}

function logoResponsiva(classe = "") {
  return `<picture class="brand-logo ${classe}">
    <source media="(min-width: 700px)" srcset="/jogos-assets/assets/logo-horizontal-inicial.png">
    <img src="/jogos-assets/assets/logo-vertical.png" alt="Jogos Infantis de Umuarama">
  </picture>`;
}

function renderInicio() {
  document.body.classList.remove("scoreboard-mode");
  clearInterval(timerAtualizacao);
  periodoAtual = null;
  visaoAtual = "CLASSIFICACAO";
  diaCronogramaAtual = null;
  quadraCronogramaAtual = null;
  corDestaqueAtual = "";
  modalidadeMobileAtual = null;
  equipeCronogramaAtual = null;
  equipeHistoricoAtual = "";
  app.innerHTML = `<section class="welcome-screen">
    <div class="welcome-content">
      ${logoResponsiva("welcome-logo")}
      <div class="welcome-copy">
        <p class="eyebrow blue">Jogos Infantis de Umuarama</p>
        <h1>Placar ao vivo dos Jogos Infantis de Umuarama <span>2026</span></h1>
        <p>Acompanhe a classificação geral e os resultados em tempo real durante os jogos.</p>
      </div>
      <div class="period-choice" aria-labelledby="period-title">
        <h2 id="period-title">Escolha o período</h2>
        <div class="choice-grid">
          ${dadosBase.periodos.map((periodo) => `<button class="choice-button" data-periodo="${periodo.id}">${periodo.nome}</button>`).join("")}
        </div>
      </div>
    </div>
  </section>`;
  app.querySelectorAll("[data-periodo]").forEach((botao) => botao.addEventListener("click", () => abrirPlacar(botao.dataset.periodo)));
}

function estruturaPlacar() {
  document.body.classList.add("scoreboard-mode");
  app.innerHTML = `<div class="public-topbar"><div><strong>JOGOS INFANTIS DE UMUARAMA 2026</strong><strong>PLACAR OFICIAL</strong></div></div>
  <header class="site-header public-header">
    <div class="header-inner"><div class="public-brand"><button type="button" class="header-home" id="nav-inicio">Início</button></div><button class="admin-button" type="button" id="abrir-acesso-admin">Área administrativa</button></div>
    <nav class="public-main-nav" aria-label="Menu principal"><button type="button" data-view="CLASSIFICACAO" class="active"><span class="nav-icon" aria-hidden="true">${iconesMenu.geral}</span><span>Geral</span></button><button type="button" data-view="CRONOGRAMA"><span class="nav-icon" aria-hidden="true">${iconesMenu.cronograma}</span><span>Cronograma</span></button><button type="button" data-view="CRONOGRAMA_EQUIPE"><span class="nav-icon" aria-hidden="true">${iconesMenu.equipes}</span><span>Por time</span></button><button type="button" data-view="RESULTADOS"><span class="nav-icon" aria-hidden="true">${iconesMenu.resultados}</span><span>Resultados</span></button></nav><button type="button" class="mobile-filter-fab" id="mobile-filter-fab" aria-label="Abrir filtros"><span class="filter-icon" aria-hidden="true">${iconesMenu.filtros}</span></button>
  </header>
  <div class="page-shell scoreboard-shell">
    <nav class="tabs public-view-tabs legacy-view-tabs" aria-label="Seções do placar público">
      <button class="tab active" type="button" data-view="CLASSIFICACAO" aria-pressed="true">Classificação</button>
      <button class="tab" type="button" data-view="CRONOGRAMA" aria-pressed="false">Cronograma geral</button>
      <button class="tab" type="button" data-view="CRONOGRAMA_EQUIPE" aria-pressed="false">Cronograma por equipes</button>
    </nav>
    <div id="public-view"></div>
  </div>
  <footer class="public-footer">
    <strong>Jogos Infantis de Umuarama - 2026</strong>
    <span>Secretaria Municipal de Educação</span>
  </footer>`;
  app.querySelector("#nav-inicio").addEventListener("click", renderInicio);
  if (!acessoAdminListenerRegistrado) {
    document.addEventListener("click", (event) => {
      if (event.target.closest("#abrir-acesso-admin")) abrirAcessoAdmin();
    });
    acessoAdminListenerRegistrado = true;
  }
  app.querySelector("#mobile-filter-fab").addEventListener("click", abrirFiltrosMobile);
  atualizarFabFiltros();
  const mudarVisao = async (visao, registrar = true) => {
    if (!["CLASSIFICACAO", "CRONOGRAMA", "CRONOGRAMA_EQUIPE", "RESULTADOS"].includes(visao)) return;
    visaoAtual = visao;
    if (registrar) history.pushState({ view: visao }, "", `#${visao.toLowerCase()}`);
    if (visaoAtual === "RESULTADOS") equipeHistoricoAtual = "";
    app.querySelectorAll("[data-view]").forEach((item) => {
      const ativo = item.dataset.view === visaoAtual;
      item.classList.toggle("active", ativo);
      item.setAttribute("aria-pressed", String(ativo));
    });
    await atualizarConteudo();
    atualizarFabFiltros();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  window.__mudarVisaoPlacar = mudarVisao;
  app.querySelectorAll("[data-view]").forEach((botao) => botao.addEventListener("click", () => mudarVisao(botao.dataset.view)));
  if (!window.__historicoPlacarLigado) {
    window.__historicoPlacarLigado = true;
    window.addEventListener("popstate", async (event) => {
      if (!periodoAtual) return;
      const visao = event.state?.view || "CLASSIFICACAO";
      await window.__mudarVisaoPlacar?.(visao, false);
    });
    let toqueInicialX = null;
    window.addEventListener("touchstart", (event) => { toqueInicialX = event.touches[0]?.clientX ?? null; }, { passive: true });
    window.addEventListener("touchend", (event) => {
      if (toqueInicialX === null || window.innerWidth > 699 || document.querySelector(".mobile-filter-modal")) return;
      const delta = (event.changedTouches[0]?.clientX ?? toqueInicialX) - toqueInicialX;
      toqueInicialX = null;
      if (Math.abs(delta) < 65) return;
      const telas = ["CLASSIFICACAO", "CRONOGRAMA", "CRONOGRAMA_EQUIPE", "RESULTADOS"];
      const indice = telas.indexOf(visaoAtual);
      const proxima = telas[indice + (delta < 0 ? 1 : -1)];
      if (proxima) window.__mudarVisaoPlacar?.(proxima);
    }, { passive: true });
  }
  history.replaceState({ view: visaoAtual }, "", `#${visaoAtual.toLowerCase()}`);
}

function abrirAcessoAdmin() {
  document.querySelector(".jogos-login-modal")?.remove();
  const modal = document.createElement("div");
  modal.className = "jogos-login-modal mobile-filter-modal";
  modal.innerHTML = `<div class="mobile-filter-backdrop"></div><section class="mobile-filter-sheet" role="dialog" aria-modal="true"><div class="mobile-filter-sheet-head"><h2>Acesso administrativo</h2></div><div class="mobile-filter-body"><input id="jogos-login" placeholder="Login" autocomplete="username"><input id="jogos-senha" type="password" placeholder="Senha" autocomplete="current-password"><label class="login-remember"><input id="jogos-lembrar" type="checkbox"> <span>Lembrar de mim neste navegador</span></label><p class="login-error"></p></div><div class="mobile-filter-actions"><button class="mobile-filter-close" type="button">Entrar</button><button class="login-cancel" type="button">Cancelar</button></div></section>`;
  document.body.append(modal);
  const loginSalvo = localStorage.getItem("jogos-login-salvo");
  const senhaSalva = localStorage.getItem("jogos-senha-salva");
  if (loginSalvo) { modal.querySelector("#jogos-login").value = loginSalvo; modal.querySelector("#jogos-lembrar").checked = true; }
  if (senhaSalva) modal.querySelector("#jogos-senha").value = senhaSalva;
  modal.querySelector(".mobile-filter-close").addEventListener("click", async () => {
    const contas = { "Vinicius Cerezuela": "@Viussu1986", "Gabriel Capoia": "@Capoia1234", Smel: "@Secretaria2026" };
    const login = modal.querySelector("#jogos-login").value.trim();
    const senha = modal.querySelector("#jogos-senha").value;
    if (contas[login] !== senha) { modal.querySelector(".login-error").textContent = "Login ou senha inválidos."; return; }
    if (modal.querySelector("#jogos-lembrar").checked) { localStorage.setItem("jogos-login-salvo", login); localStorage.setItem("jogos-senha-salva", senha); }
    else { localStorage.removeItem("jogos-login-salvo"); localStorage.removeItem("jogos-senha-salva"); }
    modal.remove();
    document.body.classList.add("integrated-admin");
    app.innerHTML = `<div class="public-topbar"><div><strong>JOGOS INFANTIS DE UMUARAMA 2026</strong></div></div>
      <header class="site-header public-header admin-header"><div class="header-inner"><div class="public-brand"><button type="button" class="header-home" id="admin-voltar-inicio">Início</button></div><button type="button" class="admin-button">Área administrativa</button></div></header>
      <nav class="public-main-nav admin-registration-nav" aria-label="Menu administrativo"><button type="button" id="admin-menu-filtros"><span class="nav-icon">⚙</span><span>Filtros</span></button><button type="button" id="admin-menu-placar"><span class="nav-icon">▥</span><span>Placar</span></button><button type="button" id="admin-menu-editar"><span class="nav-icon">✎</span><span>Editar</span></button></nav>
      <button type="button" id="admin-filter-toggle" class="admin-filter-fab" hidden>Filtros</button>
      <main id="admin-app" class="page-shell"></main><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
    await import("./admin.js?v=20260918-geral-admin-2");
    document.querySelector("#admin-voltar-inicio").onclick = () => { document.body.classList.remove("integrated-admin"); renderInicio(); };
    const filtros = document.querySelector("#admin-menu-filtros");
    filtros.onclick = () => { const aberto = !document.body.classList.contains("admin-filters-open"); if (aberto) window.scrollTo(0, 0); document.body.classList.toggle("admin-filters-open", aberto); filtros.classList.toggle("active", aberto); };
    document.querySelector("#admin-menu-placar").onclick = () => {
      const modalPlacar = document.createElement("div"); modalPlacar.className = "admin-ranking-modal";
      modalPlacar.innerHTML = `<div class="admin-ranking-backdrop"></div><section class="admin-ranking-sheet" role="dialog" aria-modal="true" aria-label="Placar geral"><div class="admin-ranking-sheet-head"><h2>Placar geral</h2></div><div class="admin-ranking-sheet-body">${document.querySelector("#admin-ranking")?.innerHTML || ""}</div><button type="button" class="admin-ranking-back">Voltar</button></section>`;
      document.body.append(modalPlacar); modalPlacar.querySelector(".admin-ranking-back").onclick = () => modalPlacar.remove(); modalPlacar.querySelector(".admin-ranking-backdrop").onclick = () => modalPlacar.remove();
    };
    document.querySelector("#admin-menu-editar").onclick = () => {
      const loading = document.createElement("div"); loading.className = "admin-edit-loading"; loading.innerHTML = '<div class="admin-edit-loading-card">Carregando resultados finalizados...</div>'; document.body.append(loading);
      document.querySelector("#toggle-correcao")?.click();
      setTimeout(() => { const cards=[...document.querySelectorAll(".match-card.finished")], origem=document.querySelector("#matches-area .matches-list"); loading.remove(); const modalEdicao=document.createElement("div"); modalEdicao.className="admin-edit-modal"; modalEdicao.innerHTML=`<section class="admin-edit-sheet" role="dialog" aria-modal="true" aria-label="Editar resultados finalizados"><h2>Editar resultados finalizados</h2><div class="admin-edit-list"></div><div class="admin-edit-actions"><button type="button" class="admin-edit-confirm">Confirmar</button></div></section>`; const lista=modalEdicao.querySelector(".admin-edit-list"); if(cards.length){ cards.forEach(card=>{ lista.append(card); card.querySelectorAll(".save-button").forEach(botao=>{ botao.disabled=false; botao.textContent="Atualizar"; }); }); } else { lista.innerHTML='<p class="empty-state">Nenhum resultado finalizado neste filtro.</p>'; } document.body.append(modalEdicao); window.__jogosAdminRebindPartidas?.(); modalEdicao.querySelector(".admin-edit-confirm").onclick=()=>{ if(origem) [...lista.querySelectorAll(".match-card")].forEach(card=>origem.append(card)); modalEdicao.remove(); }; },1400);
    };
  });
  modal.querySelector(".mobile-filter-backdrop").addEventListener("click", () => modal.remove());
  modal.querySelector(".login-cancel").addEventListener("click", () => modal.remove());
}

function atualizarFabFiltros() {
  const fab = document.querySelector("#mobile-filter-fab");
  if (fab) fab.hidden = visaoAtual === "CLASSIFICACAO";
}

function abrirFiltrosMobile() {
  const anterior = document.querySelector(".mobile-filter-modal");
  if (anterior) anterior.remove();
  const fontes = [
    ["Dia", document.querySelector(".schedule-days")],
    ["Quadra", document.querySelector(".court-buttons")],
    ["Equipe", document.querySelector(".team-picker-grid")],
    ["Equipe", document.querySelector(".history-team-picker .color-buttons")]
  ].filter(([, elemento]) => elemento);
  const modal = document.createElement("div");
  modal.className = "mobile-filter-modal";
  modal.innerHTML = `<div class="mobile-filter-backdrop" data-close-filters></div><section class="mobile-filter-sheet" role="dialog" aria-modal="true" aria-label="Filtros"><div class="mobile-filter-sheet-head"><h2>Filtros</h2></div><div class="mobile-filter-body">${fontes.map(([titulo, elemento], indice) => `<div class="mobile-filter-group"><h3>${titulo}</h3><div class="mobile-filter-options" data-filter-source="${indice}">${elemento.innerHTML}</div></div>`).join("")}</div><div class="mobile-filter-actions"><button type="button" class="mobile-filter-close" data-close-filters>Confirmar</button></div></section>`;
  document.body.appendChild(modal);
  fontes.forEach(([, original], indice) => {
    modal.querySelector(`[data-filter-source="${indice}"]`).querySelectorAll("button").forEach((botao) => botao.addEventListener("click", () => {
      const seletor = botao.dataset.teamScheduleDay ? `[data-team-schedule-day="${botao.dataset.teamScheduleDay}"]` : botao.dataset.courtChoice ? `[data-court-choice="${botao.dataset.courtChoice}"]` : botao.dataset.teamScheduleChoice ? `[data-team-schedule-choice="${botao.dataset.teamScheduleChoice}"]` : botao.dataset.historyTeam !== undefined ? `[data-history-team="${botao.dataset.historyTeam}"]` : null;
      if (seletor) original.querySelector(seletor)?.click();
      const grupo = botao.closest(".mobile-filter-options");
      grupo?.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      botao.classList.add("active");
    }));
  });
  modal.querySelectorAll("[data-close-filters]").forEach((item) => item.addEventListener("click", () => modal.remove()));
}

function linhaRanking(item) {
  const branco = item.cor === "Branco" ? " white-team" : "";
  return `<tr class="team-row${branco}" style="--team-color:${item.hex}">
    <td class="position"><strong>${item.posicao}º</strong></td>
    <td><span class="team-ident">${emblemaEquipe(item)}<span class="team-name"><strong>${item.cor}</strong><small>${item.mascote}</small></span></span></td>
    <td><strong>${item.pontos}</strong></td><td>${item.jogos}</td><td>${item.vitorias}</td><td>${item.empates}</td><td>${item.derrotas}</td>
  </tr>`;
}

function cardResultado(partida) {
  const equipeA = equipePorId(partida.equipeAId);
  const equipeB = equipePorId(partida.equipeBId);
  const pontosA = partida.placarA === partida.placarB ? CONFIG.pontos.empate : partida.placarA > partida.placarB ? CONFIG.pontos.vitoria : CONFIG.pontos.derrota;
  const pontosB = partida.placarA === partida.placarB ? CONFIG.pontos.empate : partida.placarB > partida.placarA ? CONFIG.pontos.vitoria : CONFIG.pontos.derrota;
  const venceuA = partida.placarA > partida.placarB;
  const venceuB = partida.placarB > partida.placarA;
  const modalidade = nomePorId(dadosBase.modalidades, partida.modalidadeId);
  return `<article class="result-card fixture-card">
    <div class="result-meta"><span class="sport-pill">${modalidade}</span><span>${partida.genero === "MASCULINO" ? "Masculino" : "Feminino"}</span></div>
    <div class="fixture-row">
      <span class="fixture-team home ${venceuA ? "result-winner" : ""}">${identificacaoEquipe(equipeA)}${emblemaEquipe(equipeA)}</span>
      <span class="fixture-score"><b class="${venceuA ? "winner-score" : ""}">${partida.placarA}</b><small>:</small><b class="${venceuB ? "winner-score" : ""}">${partida.placarB}</b></span>
      <span class="fixture-team away ${venceuB ? "result-winner" : ""}">${emblemaEquipe(equipeB)}${identificacaoEquipe(equipeB)}</span>
    </div>
    <p>${equipeA.cor} ${pontosA} ${pontosA === 1 ? "pt" : "pts"} · ${equipeB.cor} ${pontosB} ${pontosB === 1 ? "pt" : "pts"}</p>
  </article>`;
}

function cardResultadoHistorico(partida) {
  const equipeA = equipePorId(partida.equipeAId);
  const equipeB = equipePorId(partida.equipeBId);
  const modalidade = nomePorId(dadosBase.modalidades, partida.modalidadeId);
  const quadra = nomePorId(dadosBase.quadras, partida.quadra);
  const dia = nomePorId(dadosBase.dias, partida.dia);
  return `<article class="history-result-card">
    <div class="history-result-meta"><strong>${dia} · ${partida.horario}</strong><span>${quadra}</span><span>${modalidade} · ${partida.genero === "MASCULINO" ? "Masculino" : "Feminino"}</span></div>
    <div class="fixture-row">
      <span class="fixture-team home">${identificacaoEquipe(equipeA)}${emblemaEquipe(equipeA)}</span>
      <span class="fixture-score"><b class="${partida.placarA > partida.placarB ? "winner-score" : ""}">${partida.placarA}</b><small>:</small><b class="${partida.placarB > partida.placarA ? "winner-score" : ""}">${partida.placarB}</b></span>
      <span class="fixture-team away">${emblemaEquipe(equipeB)}${identificacaoEquipe(equipeB)}</span>
    </div>
  </article>`;
}

function statusPartida(partida) {
  if (partida.destaque === "ATUAL") return { texto: "Acontecendo", classe: "live" };
  if (partida.destaque === "PROXIMO") return { texto: "Próximo jogo", classe: "next" };
  if (partida.status === "FINALIZADO") return { texto: "Finalizado", classe: "done" };
  if (partida.status === "CANCELADO") return { texto: "Cancelado", classe: "cancelled" };
  return { texto: "Aguardando", classe: "waiting" };
}

function cardCronograma(partida) {
  const equipeA = equipePorId(partida.equipeAId);
  const equipeB = equipePorId(partida.equipeBId);
  const destaqueA = equipeA.id === corDestaqueAtual;
  const destaqueB = equipeB.id === corDestaqueAtual;
  const ocultadoPeloFiltro = corDestaqueAtual !== "" && !destaqueA && !destaqueB;
  const modalidade = nomePorId(dadosBase.modalidades, partida.modalidadeId);
  const status = statusPartida(partida);
  const placarA = partida.status === "FINALIZADO" ? partida.placarA : "";
  const placarB = partida.status === "FINALIZADO" ? partida.placarB : "";
  return `<article class="schedule-card ${partida.destaque === "ATUAL" ? "happening" : partida.destaque === "PROXIMO" ? "next-up" : ""} ${partida.status === "FINALIZADO" ? "finished" : ""} ${destaqueA || destaqueB ? "has-team-highlight" : ""} ${ocultadoPeloFiltro ? "team-filter-muted" : ""}">
    <div class="schedule-card-top">
      <div><time>${partida.horario}</time><span class="sport-pill">${modalidade}</span></div>
      <span class="status ${status.classe}">${status.texto}</span>
    </div>
    <div class="fixture-row schedule-fixture">
      <span class="fixture-team home ${destaqueA ? "team-highlight" : ""}">${identificacaoEquipe(equipeA)}${emblemaEquipe(equipeA)}</span>
      <span class="fixture-score ${partida.status !== "FINALIZADO" ? "empty-score" : ""}"><b>${placarA}</b><small>:</small><b>${placarB}</b></span>
      <span class="fixture-team away ${destaqueB ? "team-highlight" : ""}">${emblemaEquipe(equipeB)}${identificacaoEquipe(equipeB)}</span>
    </div>
    <span class="schedule-gender">${partida.genero === "MASCULINO" ? "Masculino" : "Feminino"}</span>
  </article>`;
}

function ordenarCronograma(partidas) {
  const prioridade = { EM_ANDAMENTO: 0, AGUARDANDO: 1, FINALIZADO: 2, CANCELADO: 3 };
  const ordenadas = [...partidas].sort((a, b) => {
    const porStatus = (prioridade[a.status] ?? 1) - (prioridade[b.status] ?? 1);
    return porStatus || a.horario.localeCompare(b.horario) || a.ordem - b.ordem;
  });
  const ativas = ordenadas.filter((partida) => !["FINALIZADO", "CANCELADO"].includes(partida.status));
  return ordenadas.map((partida) => ({
    ...partida,
    destaque: partida.id === ativas[0]?.id ? "ATUAL" : partida.id === ativas[1]?.id ? "PROXIMO" : null,
  }));
}

async function renderClassificacao() {
  const periodoNome = nomePorId(dadosBase.periodos, periodoAtual);
  const { ranking, resultados } = await api.getPlacar(periodoAtual);
  document.querySelector("#public-view").innerHTML = `<section class="scoreboard-heading">
      <div><p class="eyebrow blue">Acompanhe em tempo real</p><h2>Classificação geral <span class="classification-period">${periodoNome.toUpperCase()}</span></h2></div>
    </section>
    <div class="dashboard-grid">
      <section class="panel ranking-panel"><div id="ranking"></div></section>
      <section class="results-section">
        <div class="section-heading editorial-heading"><div><p class="eyebrow blue">Acompanhe em tempo real</p><h2>Últimos resultados</h2><p>Resultados lançados recentemente</p></div><span class="live-badge">Ao vivo</span></div>
        <div id="resultados" class="results-list"></div>
      </section>
    </div>
    <p class="updated-at" id="atualizado"></p>`;
  document.querySelector("#ranking").innerHTML = `<div class="table-wrap"><table class="ranking-table">
    <thead><tr><th>Posição</th><th>Cor</th><th title="Pontos">P</th><th title="Jogos">J</th><th title="Vitórias">V</th><th title="Empates">E</th><th title="Derrotas">D</th></tr></thead>
    <tbody>${ranking.map(linhaRanking).join("")}</tbody>
  </table></div>`;
  document.querySelector("#resultados").innerHTML = resultados.length ? resultados.map(cardResultado).join("") : `<div class="empty-state">Nenhum resultado lançado neste período.</div>`;
  document.querySelector("#atualizado").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR")}`;
}

async function renderHistoricoResultados() {
  const equipes = dadosBase.equipes.filter((equipe) => equipe.periodo === periodoAtual && equipe.ativo);
  const partidas = (await Promise.all(dadosBase.dias.map((dia) => api.getCronograma(periodoAtual, dia.id))))
    .flat()
    .filter((partida) => partida.status === "FINALIZADO")
    .filter((partida) => !equipeHistoricoAtual || [partida.equipeAId, partida.equipeBId].includes(equipeHistoricoAtual))
    .sort((a, b) => new Date(b.atualizadoEm ?? 0) - new Date(a.atualizadoEm ?? 0) || b.horario.localeCompare(a.horario));
  const periodoNome = nomePorId(dadosBase.periodos, periodoAtual);
  document.querySelector("#public-view").innerHTML = `<section class="scoreboard-heading history-heading">
      <div><p class="eyebrow blue">Histórico completo</p><h2>Jogos finalizados <span class="classification-period">${periodoNome.toUpperCase()}</span></h2></div>
    </section>
    <section class="choice-panel history-team-picker team-schedule-picker"><div class="picker-heading"><p class="eyebrow blue">Torcida</p><h3>Equipes</h3><span>Selecione uma cor para filtrar</span></div><div class="team-picker-grid">
      <button type="button" class="team-picker-choice ${equipeHistoricoAtual === "" ? "active" : ""}" data-history-team=""><strong>Todos</strong></button>
      ${equipes.map((equipe) => `<button type="button" class="team-picker-choice ${equipe.id === equipeHistoricoAtual ? "active" : ""}" data-history-team="${equipe.id}">${emblemaEquipe(equipe)}<strong>${equipe.cor}</strong></button>`).join("")}
    </div></section>
    <div class="history-results-grid">${partidas.length ? partidas.map(cardResultadoHistorico).join("") : '<div class="empty-state">Nenhum jogo finalizado para este filtro.</div>'}</div>
    <p class="updated-at">${partidas.length} ${partidas.length === 1 ? "jogo finalizado" : "jogos finalizados"}</p>`;
  document.querySelectorAll("[data-history-team]").forEach((botao) => botao.addEventListener("click", async () => {
    equipeHistoricoAtual = botao.dataset.historyTeam;
    await renderHistoricoResultados();
  }));
}

async function renderCronograma() {
  diaCronogramaAtual ??= dadosBase.dias[0]?.id;
  quadraCronogramaAtual ??= dadosBase.quadras[0]?.id;
  const periodoNome = nomePorId(dadosBase.periodos, periodoAtual);
  const partidasDoDia = await api.getCronograma(periodoAtual, diaCronogramaAtual);
  const quadra = dadosBase.quadras.find((item) => item.id === quadraCronogramaAtual) ?? dadosBase.quadras[0];
  const modalidades = dadosBase.modalidades.filter((modalidade) => modalidade.quadraId === quadra.id);
  const colunaGenero = (modalidade, genero) => {
    const partidas = ordenarCronograma(partidasDoDia.filter((partida) => partida.quadra === quadra.id && partida.modalidadeId === modalidade.id && partida.genero === genero));
    const acontecendo = partidas.find((partida) => partida.destaque === "ATUAL");
    const demaisPartidas = partidas.filter((partida) => partida.destaque !== "ATUAL");
    const acontecendoTemDestaque = acontecendo && [acontecendo.equipeAId, acontecendo.equipeBId].includes(corDestaqueAtual);
    const painelAcontecendoDesativado = corDestaqueAtual !== "" && acontecendo && !acontecendoTemDestaque;
    return `<section class="gender-lane"><div class="gender-lane-heading"><h4>${genero === "FEMININO" ? "Feminino" : "Masculino"}</h4><span>${partidas.length} jogos</span></div>${acontecendo ? `<div class="live-game-panel ${painelAcontecendoDesativado ? "team-filter-muted-panel" : ""}">${cardCronograma(acontecendo)}</div>` : ""}<div class="gender-games">${demaisPartidas.length ? demaisPartidas.map(cardCronograma).join("") : acontecendo ? "" : '<div class="empty-state compact">Nenhum jogo</div>'}</div></section>`;
  };
  document.querySelector("#public-view").innerHTML = `<section class="scoreboard-heading schedule-heading">
      <div><p class="eyebrow blue">Programação dos jogos</p><h2>Cronograma <span class="classification-period">${periodoNome.toUpperCase()}</span></h2></div>
    </section>
    <nav class="schedule-days" aria-label="Dias do cronograma">
      ${dadosBase.dias.map((dia) => `<button type="button" class="schedule-day ${dia.id === diaCronogramaAtual ? "active" : ""}" data-schedule-day="${dia.id}" aria-pressed="${dia.id === diaCronogramaAtual}">${dia.nome}</button>`).join("")}
    </nav>
    <div class="schedule-selectors">
      <section class="choice-panel"><div class="section-title-block"><p class="eyebrow blue">${nomePorId(dadosBase.dias, diaCronogramaAtual)}</p><h3>${quadra.nome}</h3></div><div class="court-buttons">${dadosBase.quadras.map((item) => `<button type="button" class="filter-choice court-choice ${item.id === quadra.id ? "active" : ""}" data-court-choice="${item.id}">${item.nome}</button>`).join("")}</div></section>
    </div>
    <div class="schedule-content-layout">
      <section class="selected-court"><div class="activity-grid">${modalidades.map((modalidade) => `<section class="activity-column"><div class="activity-heading"><span>${quadra.nome}</span><h3>${modalidade.nome}</h3></div><div class="gender-grid">${colunaGenero(modalidade, "FEMININO")}${colunaGenero(modalidade, "MASCULINO")}</div></section>`).join("")}</div></section>
    </div>
    <p class="updated-at">Atualizado às ${new Date().toLocaleTimeString("pt-BR")}</p>`;
  document.querySelectorAll("[data-schedule-day]").forEach((botao) => botao.addEventListener("click", async () => {
    diaCronogramaAtual = botao.dataset.scheduleDay;
    await renderCronograma();
  }));
  document.querySelectorAll("[data-court-choice]").forEach((botao) => botao.addEventListener("click", async () => {
    quadraCronogramaAtual = botao.dataset.courtChoice;
    modalidadeMobileAtual = dadosBase.modalidades.find((modalidade) => modalidade.quadraId === quadraCronogramaAtual)?.id ?? null;
    await renderCronograma();
  }));
}

function descricaoJogoAnterior(partida, partidasDoDia) {
  const sequencia = partidasDoDia
    .filter((item) => item.modalidadeId === partida.modalidadeId)
    .sort((a, b) => a.horario.localeCompare(b.horario) || a.ordem - b.ordem || a.genero.localeCompare(b.genero) || a.id.localeCompare(b.id));
  const indice = sequencia.findIndex((item) => item.id === partida.id);
  const anterior = indice > 0 ? sequencia[indice - 1] : null;
  if (!anterior) return `<span class="after-label">Primeiro jogo do dia</span>`;
  const equipeA = equipePorId(anterior.equipeAId);
  const equipeB = equipePorId(anterior.equipeBId);
  return `<span class="after-label">Após de</span><span class="after-match">${emblemaEquipe(equipeA)}<b>${equipeA.cor}</b><i>×</i>${emblemaEquipe(equipeB)}<b>${equipeB.cor}</b></span>`;
}

function cardCronogramaEquipe(partida, partidasDoDia, equipe) {
  const adversario = equipePorId(partida.equipeAId === equipe.id ? partida.equipeBId : partida.equipeAId);
  const modalidade = nomePorId(dadosBase.modalidades, partida.modalidadeId);
  const quadra = nomePorId(dadosBase.quadras, partida.quadra);
  const status = statusPartida(partida);
  const finalizado = partida.status === "FINALIZADO";
  const placarEquipe = partida.equipeAId === equipe.id ? partida.placarA : partida.placarB;
  const placarAdversario = partida.equipeAId === equipe.id ? partida.placarB : partida.placarA;
  return `<article class="team-schedule-card ${finalizado ? "finished" : ""} ${partida.destaque === "PROXIMO" ? "next" : ""}">
    <div class="team-schedule-card-top"><time>${partida.horario}</time><span class="status ${status.classe}">${status.texto}</span></div>
    <div class="team-schedule-location"><strong>${quadra}</strong><span>${modalidade} · ${partida.genero === "MASCULINO" ? "Masculino" : "Feminino"}</span></div>
    <div class="team-schedule-versus">
      <div>${emblemaEquipe(equipe)}<span><b>${equipe.cor}</b><small>${equipe.mascote}</small></span></div>
      <strong class="team-schedule-score">${finalizado ? `${placarEquipe} × ${placarAdversario}` : "×"}</strong>
      <div>${emblemaEquipe(adversario)}<span><b>${adversario.cor}</b><small>${adversario.mascote}</small></span></div>
    </div>
    <div class="team-schedule-after">${descricaoJogoAnterior(partida, partidasDoDia)}</div>
  </article>`;
}

async function renderCronogramaEquipe() {
  diaCronogramaAtual ??= dadosBase.dias[0]?.id;
  const equipes = dadosBase.equipes.filter((equipe) => equipe.periodo === periodoAtual && equipe.ativo);
  if (equipeCronogramaAtual && !equipes.some((equipe) => equipe.id === equipeCronogramaAtual)) equipeCronogramaAtual = null;
  const equipe = equipeCronogramaAtual ? equipePorId(equipeCronogramaAtual) : null;
  const partidasDoDia = await api.getCronograma(periodoAtual, diaCronogramaAtual);
  const partidasDaEquipe = (equipe ? partidasDoDia : [])
    .filter((partida) => [partida.equipeAId, partida.equipeBId].includes(equipe.id))
    .sort((a, b) => a.horario.localeCompare(b.horario) || a.ordem - b.ordem);
  const proxima = partidasDaEquipe.find((partida) => !["FINALIZADO", "CANCELADO"].includes(partida.status));
  const partidas = partidasDaEquipe
    .map((partida) => ({ ...partida, destaque: partida.id === proxima?.id ? "PROXIMO" : null }))
    .sort((a, b) => {
      const prioridade = a.destaque === "PROXIMO" ? 0 : a.status === "FINALIZADO" ? 2 : 1;
      const prioridadeB = b.destaque === "PROXIMO" ? 0 : b.status === "FINALIZADO" ? 2 : 1;
      return prioridade - prioridadeB || a.horario.localeCompare(b.horario) || a.ordem - b.ordem;
    });
  const periodoNome = nomePorId(dadosBase.periodos, periodoAtual);
  document.querySelector("#public-view").innerHTML = `<section class="scoreboard-heading schedule-heading">
      <div><p class="eyebrow blue">Programação por equipe</p><h2>Jogos da equipe <span class="classification-period">${periodoNome.toUpperCase()}</span></h2></div>
    </section>
    <nav class="schedule-days" aria-label="Dias do cronograma">
      ${dadosBase.dias.map((dia) => `<button type="button" class="schedule-day ${dia.id === diaCronogramaAtual ? "active" : ""}" data-team-schedule-day="${dia.id}" aria-pressed="${dia.id === diaCronogramaAtual}">${dia.nome}</button>`).join("")}
    </nav>
    <section class="choice-panel team-schedule-picker"><div class="picker-heading"><p class="eyebrow blue">Torcida</p><h3>Equipes</h3><span>Selecione uma cor para filtrar</span></div><div class="team-picker-grid">${equipes.map((item) => `<button type="button" class="team-picker-choice ${equipe && item.id === equipe.id ? "active" : ""}" data-team-schedule-choice="${item.id}">${emblemaEquipe(item)}<strong>${item.cor}</strong></button>`).join("")}</div></section>
    ${equipe ? `<section class="team-schedule-panel"><section class="team-schedule-heading">${emblemaEquipe(equipe)}<div><span>${nomePorId(dadosBase.dias, diaCronogramaAtual)}</span><h3>${equipe.cor}</h3><small>${equipe.mascote} · ${partidas.length} jogos</small></div></section><div class="team-schedule-grid">${partidas.length ? partidas.map((partida) => cardCronogramaEquipe(partida, partidasDoDia, equipe)).join("") : '<div class="empty-state">Nenhum jogo desta equipe neste dia.</div>'}</div></section>` : '<div class="empty-state team-selection-prompt">Selecione uma equipe para visualizar seus jogos.</div>'}
    <p class="updated-at">Atualizado às ${new Date().toLocaleTimeString("pt-BR")}</p>`;
  document.querySelectorAll("[data-team-schedule-day]").forEach((botao) => botao.addEventListener("click", async () => {
    diaCronogramaAtual = botao.dataset.teamScheduleDay;
    await renderCronogramaEquipe();
  }));
  document.querySelectorAll("[data-team-schedule-choice]").forEach((botao) => botao.addEventListener("click", async () => {
    equipeCronogramaAtual = botao.dataset.teamScheduleChoice;
    await renderCronogramaEquipe();
  }));
}

async function atualizarConteudo() {
  if (!periodoAtual) return;
  if (visaoAtual === "CRONOGRAMA") await renderCronograma();
  else if (visaoAtual === "CRONOGRAMA_EQUIPE") await renderCronogramaEquipe();
  else if (visaoAtual === "RESULTADOS") await renderHistoricoResultados();
  else await renderClassificacao();
}

async function abrirPlacar(periodo) {
  periodoAtual = periodo;
  visaoAtual = "CLASSIFICACAO";
  diaCronogramaAtual = dadosBase.dias[0]?.id ?? null;
  quadraCronogramaAtual = dadosBase.quadras[0]?.id ?? null;
  corDestaqueAtual = "";
  equipeCronogramaAtual = null;
  modalidadeMobileAtual = dadosBase.modalidades.find((modalidade) => modalidade.quadraId === quadraCronogramaAtual)?.id ?? null;
  estruturaPlacar();
  await atualizarConteudo();
  timerAtualizacao = setInterval(atualizarConteudo, CONFIG.atualizacaoPublicaSegundos * 1000);
}

window.addEventListener("jogos:atualizado", atualizarConteudo);
dadosBase = await api.getDadosBase();
renderInicio();
