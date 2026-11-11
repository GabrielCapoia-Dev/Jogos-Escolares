# Tela administrativa de backups — validação de 11/11/2026

A tela reúne cópias diárias completas e snapshots de resultados por data, com filtros, download autenticado e restauração confirmada. No celular, o acesso fica no menu superior; o público não recebe botão ou acesso aos endpoints.

## Recuperação

A restauração aplica jogos, punições, confirmações e partidas finais dos dois períodos. Preserva o sorteio, os horários, usuários, tokens, histórico e cópias anteriores. Antes da alteração, grava e identifica uma cópia `BEFORE_RESTORE`; a operação é transacional e auditada. O cache é atualizado e as telas conectadas são notificadas após liberar o bloqueio de operação. Lançamentos concorrentes recebem erro temporário explícito.

Os downloads completos são privados. Sessões vencidas, usuários sem papel ADMIN, caminhos inválidos, links simbólicos e arquivos com SHA-256 divergente são recusados. Não existe upload de SQL ou execução de SQL extraído do arquivo: pg_restore é utilizado apenas para ler dados das quatro tabelas autorizadas.

## Testes locais

- Cinco testes unitários da API: parsing do COPY, escapes e Unicode, rejeição de dados malformados, caminho/integridade e bloqueio de requisições durante recuperação.
- Integração com PostgreSQL isolado: download dos dois formatos, restauração de 480 resultados, duas punições, duas confirmações e 36 finais, desfazer pela cópia anterior, arquivo real extraído com pg_restore 16, arquivo corrompido, cronograma incompatível, confirmação ausente, autenticação e bloqueio de gravações concorrentes.
- Falha simulada ao criar a cópia de segurança: nenhuma restauração aplicada.
- Sessão vencida e papel não administrativo: acesso negado.
- Cinco cenários de navegador: listar/filtrar/baixar/restaurar, confirmação e cancelamento, atualização pública por WebSocket, larguras de 320/390/1024/1366 pixels e ausência do menu no público.
- Testes de regressão da API e da interface pública/administrativa, build Angular e análise estática Go.

As restaurações desta validação foram feitas somente na base local QA. A implantação deve conferir a listagem/download online sem restaurar ou zerar dados reais e comparar os 480 jogos públicos com a cópia anterior.
