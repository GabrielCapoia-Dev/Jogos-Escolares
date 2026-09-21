# Jogos Escolares

Fundação da migração do placar legado para Go + PostgreSQL. O domínio reproduz a geração determinística das 21 equipes e 504 partidas do `jogos-assets/js/data.js`, além da classificação por período e gênero.

## Validação local

```powershell
go test ./...
go run ./cmd/api
```

Endpoints iniciais: `GET /healthz`, `/api/v1/config`, `/periods`, `/days`, `/courts`, `/sports`, `/teams?period=MANHA`, `/matches?period=MANHA&day=DIA_1` e `/standings?period=MANHA&gender=GERAL`.

O Compose sobe PostgreSQL, API Go e frontend Angular com healthchecks básicos. O frontend usa proxy `/api` para a API e reproduz a tela pública do protótipo: período, classificação, cronograma, resultados e filtros. Os resultados são persistidos no PostgreSQL, exigem autenticação administrativa e cada lançamento é registrado em auditoria.

Antes de iniciar uma nova edição, entre na área administrativa e use **Zerar**. A ação confirma a intenção e devolve todas as partidas para `AGUARDANDO`, com placar `0 × 0`.

## Hub de teste

O Compose em `.deploy/docker-compose.yml` atende as portas `18080` (API) e `18081` (site), constrói as imagens a partir deste repositório e reutiliza o volume PostgreSQL existente. Antes de executar `down` e `up --build`, confirme que `JOGOS_POSTGRES_VOLUME` aponta para o volume de dados atual do hub; o valor padrão corresponde ao volume identificado em 21/09/2026. Não use `down --volumes` para zerar placares: isso apagaria todo o banco.
