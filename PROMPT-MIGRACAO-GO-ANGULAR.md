# Prompt de migração — Jogos Escolares

Você é um engenheiro de software sênior responsável por transformar este sistema de placar e administração dos Jogos Escolares em uma aplicação independente, usando Go no backend e Angular no frontend.

## Objetivo

Migrar todo o sistema existente para uma arquitetura desacoplada, preservando as regras atuais de negócio, os fluxos administrativos, os dados iniciais, a classificação, os filtros, a edição de resultados e o comportamento responsivo.

## Stack obrigatória

- Backend: Go 1.23 ou superior, preferencialmente Gin ou Chi.
- Frontend: Angular atual com TypeScript, standalone components e Angular Router.
- Banco: PostgreSQL.
- Persistência e migrações: ferramenta idiomática de Go, como `golang-migrate` ou `goose`.
- Autenticação: sessão segura ou JWT com refresh token; nunca armazenar credenciais no frontend.
- Infraestrutura: Docker Compose para desenvolvimento e produção.
- Testes: testes unitários e de integração no Go; testes de componentes e serviços no Angular.

## Funcionalidades que devem ser preservadas

1. Tela pública inicial com identidade visual dos Jogos Escolares.
2. Navegação por início, filtros, placar e área administrativa.
3. Cadastro e manutenção de períodos, dias, quadras, modalidades, gêneros e equipes.
4. Listagem de partidas com filtros por período, dia, quadra, modalidade e gênero.
5. Registro, edição e atualização de placares.
6. Estados da partida, classificação, critérios de desempate, vitórias, pontos e saldo.
7. Registro de logs/auditoria das alterações administrativas.
8. Área administrativa protegida para gerenciamento dos resultados.
9. Layout responsivo para desktop e mobile, incluindo modal de filtros e navegação inferior.
10. Importação dos dados atualmente definidos em `jogos-assets/js/data.js` e `config.js`.

## Requisitos de arquitetura

- Separar claramente domínio, casos de uso, repositórios, HTTP handlers e infraestrutura no Go.
- Criar contratos JSON versionados para partidas, equipes, classificação, filtros e autenticação.
- Validar todos os payloads no backend.
- Aplicar autorização por operação administrativa.
- Usar transações para atualização de placar e gravação de auditoria.
- Não confiar em cálculos enviados pelo frontend; classificação e estados devem ser recalculados no backend.
- Implementar paginação, filtros e ordenação no servidor quando aplicável.
- Configurar CORS, proteção contra CSRF quando houver sessão, rate limiting, logs estruturados e tratamento uniforme de erros.
- Criar seeders para os dados iniciais e uma estratégia explícita de importação dos dados legados.

## Plano de execução

1. Ler e documentar o sistema atual antes de editar.
2. Inventariar entidades, estados, regras de pontuação, critérios de desempate e fluxos administrativos.
3. Criar o modelo relacional e as migrações PostgreSQL.
4. Implementar o domínio e os casos de uso no Go.
5. Implementar API REST documentada com OpenAPI.
6. Implementar autenticação e autorização.
7. Migrar os dados iniciais e validar contagens e relacionamentos.
8. Criar o frontend Angular por módulos: público, partidas, classificação, filtros e administração.
9. Reproduzir o layout responsivo e as interações atuais sem copiar acoplamentos do JavaScript legado.
10. Criar testes focados para cada regra crítica.
11. Criar Docker Compose, variáveis de ambiente, healthchecks e pipeline de build.
12. Executar revisão final de segurança, performance, acessibilidade e compatibilidade mobile.

## Critérios de aceite

- O placar público funciona sem depender de Laravel, Blade, localStorage ou Google Apps Script.
- Toda alteração administrativa é persistida no PostgreSQL e auditada.
- A classificação calculada pelo Go coincide com os resultados esperados dos dados legados.
- Usuário não autenticado não consegue alterar partidas.
- Testes unitários, integração e frontend passam.
- `docker compose up` inicia todos os serviços com healthchecks saudáveis.
- A documentação inclui instalação, variáveis de ambiente, migrações, seed, comandos de teste e deploy.

Antes de implementar, apresente um diagnóstico curto do sistema legado, o modelo de domínio proposto, os endpoints e um plano incremental. Não faça uma reescrita ampla sem preservar o comportamento comprovado pelos testes.
