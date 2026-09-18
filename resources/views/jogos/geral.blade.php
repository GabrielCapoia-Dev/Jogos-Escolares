<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#004090">
    <meta name="description" content="Classificação e resultados dos Jogos Infantis de Umuarama 2026.">
    <title>Placar ao vivo | Jogos Infantis de Umuarama 2026</title>
    <link rel="stylesheet" href="{{ asset('jogos-assets/css/styles.css') }}?v=20260917-paleta-logo">
    <link rel="stylesheet" href="{{ asset('jogos-assets/css/metro-theme.css') }}?v=20260918-responsive-menus">
    <style>
      @media (min-width:700px) {
        html:has(body.scoreboard-mode) { font-size:17px; }
      }
      .welcome-screen .choice-button,
      .welcome-screen .choice-button:nth-child(2) { color:#708196!important; background:#e5e9ee!important; border:1px solid #cbd8e6!important; box-shadow:none!important; }
      .welcome-screen .choice-button:hover,
      .welcome-screen .choice-button:focus-visible { color:#003b82!important; background:#e4effc!important; border-color:#005cb8!important; }
      body:has(.mobile-filter-modal), body:has(.admin-ranking-modal), body:has(.admin-edit-modal), body.integrated-admin.admin-filters-open { overflow:hidden!important; }
      html:has(.mobile-filter-modal), html:has(.admin-ranking-modal), html:has(.admin-edit-modal), html:has(body.integrated-admin.admin-filters-open) { overflow:hidden!important; }
      .admin-edit-modal { pointer-events:auto; }
      .admin-edit-loading { position:fixed; z-index:130; inset:0; display:grid; place-items:center; background:rgba(0,24,60,.48); color:#003b82; }
      .admin-edit-loading-card { padding:1.25rem 1.5rem; border-radius:14px; background:#fff; font-weight:800; }
      .admin-edit-loading-card::before { content:""; display:inline-block; width:1rem; height:1rem; margin-right:.55rem; vertical-align:-.15rem; border:3px solid #cbd8e6; border-top-color:#005cb8; border-radius:50%; animation:admin-spin .8s linear infinite; }
      @keyframes admin-spin { to { transform:rotate(360deg); } }
      body.integrated-admin .filters-panel, body.integrated-admin #admin-ranking, body.integrated-admin .correction-panel { display:none!important; }
      @media (max-width:699px) {
        body.integrated-admin.admin-filters-open .filters-panel { position:fixed!important; z-index:100; right:0; bottom:0; left:0; display:block!important; max-height:82vh; overflow:auto; margin:0; padding:1rem; border:0; border-radius:18px 18px 0 0; background:#fff; box-shadow:0 -8px 28px rgba(0,24,60,.24); }
        body.integrated-admin.admin-filters-open::before { content:""; position:fixed; z-index:39; inset:0; background:rgba(0,24,60,.48); }
        body.integrated-admin.admin-filters-open .admin-registration-nav { display:none; }
      }
      body.integrated-admin .admin-intro { padding-top:1.4rem!important; }
      body.integrated-admin .admin-team-name>span:last-child { display:flex; flex-direction:column; align-items:center; gap:.08rem; line-height:1.05; }
      body.integrated-admin .admin-team-name>span:last-child small { display:block; font-size:.68em; font-weight:650; }
      body.integrated-admin .admin-edit-modal { position:fixed; z-index:120; inset:0; display:grid; align-items:end; background:rgba(0,24,60,.48); }
      body.integrated-admin .admin-edit-sheet { display:flex; max-height:88vh; flex-direction:column; overflow:hidden; padding:1rem; border-radius:18px 18px 0 0; background:#fff; }
      body.integrated-admin .admin-edit-list { min-height:0; overflow-y:auto; padding:.25rem 0 .75rem; }
      body.integrated-admin .admin-edit-actions { flex:none; padding-top:.7rem; border-top:1px solid #d8e2ee; background:#fff; }
      body.integrated-admin .admin-edit-confirm { width:100%; min-height:46px; border:0; border-radius:9px; color:#fff; background:#004a99; font-weight:800; text-transform:uppercase; }
      body.integrated-admin .admin-registration-nav { position:fixed; z-index:26; right:0; bottom:0; left:0; display:flex; min-height:62px; margin:0; padding:.25rem; border-top:3px solid #004a99; background:#fff; box-shadow:0 -4px 16px rgba(0,32,80,.16); }
      body.integrated-admin .admin-registration-nav button { flex:1; display:grid; grid-template-rows:1fr auto; align-content:center; justify-items:center; gap:2px; min-height:54px; margin:0; padding:.25rem .15rem; border:0; border-radius:7px!important; color:#708196; background:#e5e9ee!important; font-size:.62rem; font-weight:800; }
      body.integrated-admin .admin-registration-nav button.active { color:#fff; background:#003b82!important; }
      body.integrated-admin .admin-registration-nav .nav-icon { display:grid; width:22px; height:22px; place-items:center; font-size:1.1rem; }
      body.integrated-admin #admin-app { background:#eef4fb; }
      body.integrated-admin > #app .site-header { position:sticky; top:0; z-index:150; background:#fff; }
      body.integrated-admin .admin-intro, body.integrated-admin .matches-heading { margin:0 0 1rem; padding:1.35rem 1rem 1rem; background:#fff; }
      body.integrated-admin .admin-intro h2 { margin:0; }
      body.integrated-admin .matches-area { padding:0 1rem 5rem; }
      .jogos-login-modal .login-remember { display:flex; align-items:center; gap:.45rem; margin-top:.55rem; color:#365579; font-size:.78rem; }
      .jogos-login-modal .login-remember input { width:auto; margin:0; }
    </style>
  </head>
  <body>
    <main id="app" class="public-app"></main>
    <script type="module" src="{{ asset('jogos-assets/js/geral.js') }}?v=20260918-json-api"></script>
  </body>
</html>
