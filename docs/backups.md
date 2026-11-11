# Backups dos Jogos Escolares

## Tela administrativa

O menu **Backups**, disponível somente na área administrativa no desktop e no celular, lista os snapshots e os arquivos diários por data. Permite filtrar por tipo e intervalo de datas, baixar cada cópia e restaurar após digitar `RESTAURAR` na confirmação. Datas são exibidas no horário de Brasília.

A recuperação pela tela substitui **jogos, punições e finais dos dois períodos**. Mesmo ao escolher um arquivo completo do banco, mantém as contas de acesso, os tokens, o histórico de auditoria, as configurações e todas as cópias existentes. O sorteio e os horários devem ser compatíveis; snapshots antigos incompatíveis são identificados e bloqueados. Não há upload de arquivos arbitrários.

Antes de aplicar a cópia, salva um snapshot **Antes de restaurar**, que aparece na lista e pode ser usado para desfazer a operação. Uma falha nessa gravação impede a restauração. A alteração é transacional e auditada, o cache da API é atualizado e as telas conectadas são avisadas por WebSocket. Os lançamentos ficam temporariamente bloqueados durante a operação; não é necessário reiniciar o sistema após uma recuperação pela tela.

Downloads e restaurações exigem sessão administrativa ativa e não vencida. Os arquivos diários são montados somente para leitura na API e têm SHA-256 verificado antes de baixar/restaurar. A extração do arquivo usa `pg_restore` somente para produzir dados das quatro tabelas operacionais; nenhum SQL do arquivo é executado.

## Antes de zerar

A API salva, na mesma transação, partidas, punições, confirmações de finalistas e partidas finais em `result_reset_backups`. Uma falha no backup aborta o zeramento. A rotina de recuperação de placares em `scripts/restore_results_backup.sql` preserva outro snapshot antes de restaurar e recusa um sorteio/horário diferente. Antes de uma recuperação real, impedir novos lançamentos; depois, reiniciar a API para recarregar seu cache.

## Cópia completa diária

O serviço Compose `backup` executa `scripts/backups/run.sh` e consulta a data a cada 15 segundos. O fuso é `America/Sao_Paulo`: a primeira execução após 00:00 produz a cópia daquele dia. Se estiver desligado à meia-noite, faz a cópia ao iniciar. A primeira ativação também produz uma cópia caso ainda não exista uma do dia.

- Conexão ao banco somente para leitura, usando `pg_dump` do PostgreSQL 16.
- Arquivo custom completo, validado com leitura integral por `pg_restore` antes de marcar sucesso.
- SHA-256 individual e publicação dos arquivos por renomeação após gravação.
- Falhas são registradas e tentadas novamente no próximo ciclo.
- Não exclui cópias anteriores. Não expõe uma porta ou diretório web.
- Arquivos na pasta persistente `/root/Projeto/Jogos-Escolares/.deploy/backups`, com permissões privadas, fora do volume PostgreSQL e do Git/contexto de build.
- `.last-success` e `latest.json` identificam a última cópia; os arquivos `.dump` e `.dump.sha256` formam cada cópia.
- O healthcheck sinaliza ausência de cópia válida ou idade superior a 25 horas. Isso não envia notificações externas automaticamente.

As cópias diárias ficam no servidor. Isso não constitui replicação automática para outro computador ou provedor. A cópia local autorizada em 11/11/2026 permanece uma proteção adicional separada.

## Conferência e recuperação

`sudo jogos-escolares ps` mostra o estado do serviço `backup`. Antes de restaurar um arquivo, verificar seu SHA-256 e restaurá-lo primeiro em uma base nova com `pg_restore --no-owner --no-privileges --exit-on-error`. Não sobrescrever o banco online sem selecionar a cópia e preparar a interrupção dos lançamentos.

Os oito cenários do agendador podem ser executados no ambiente Windows/WSL deste projeto com `python scripts/backups/test_schedule.py`. Eles usam relógio e comandos PostgreSQL simulados, sem modificar o banco online. A restauração integral real e a recuperação dos snapshots foram verificadas separadamente em bases locais.
