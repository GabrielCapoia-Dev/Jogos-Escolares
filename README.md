# Jogos Escolares

Fundação da migração do placar legado para Go + PostgreSQL. O domínio reproduz a geração determinística das 21 equipes e 504 partidas do `jogos-assets/js/data.js`, além da classificação por período e gênero.

## Validação local

```powershell
go test ./...
go run ./cmd/api
```

Endpoints iniciais: `GET /healthz`, `/api/v1/config`, `/periods`, `/days`, `/courts`, `/sports`, `/teams?period=MANHA`, `/matches?period=MANHA&day=DIA_1` e `/standings?period=MANHA&gender=GERAL`.

O Compose sobe PostgreSQL, API Go e frontend Angular com healthchecks básicos. O frontend usa proxy `/api` para a API e reproduz a tela pública do protótipo: período, classificação, cronograma, resultados e filtros. A persistência transacional, autenticação administrativa e gravação de resultados ainda são etapas pendentes; a API atual usa o seed em memória para validar contrato e regras sem mascarar essa pendência.
