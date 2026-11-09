# Validação das correções — 09/11/2026

As simulações foram executadas em PostgreSQL descartável e API local. O sistema online foi consultado sem lançar resultados ou punições.

## Correções

- Adiantar partida deixa de produzir erro SQL de coluna ambígua e preserva seu horário.
- Confirmação de finalistas preserva os classificados garantidos; a escolha manual resolve somente as vagas empatadas no corte.
- Alterações em resultados e punições exigem nova confirmação dos finalistas. Reconfirmar as mesmas equipes mantém confrontos e placares finais; mudar participantes arquiva os jogos anteriores.
- Finais passam a ter registro e correção de placares por gênero, classificação própria e atualização pública em tempo real. Os jogos são armazenados separadamente das 480 partidas classificatórias.
- Zerar inclui resultados finais e mantém backup transacional de partidas, punições, confirmações e jogos finais antes de remover dados.
- Exportação geral busca as duas quadras independentemente do filtro visual.
- Por equipe oferece o popup de filtros também no desktop.
- A exibição da final considera o período, eliminando horários matutinos na tela da tarde.
- Corrigidos aviso CSS, texto de remoção de punição e comando de testes da interface. Os assets são preparados automaticamente para builds locais.

## Verificações aprovadas

- Build de produção Angular, compilação Go e análise estática `go vet`.
- Oito testes unitários de domínio; cinco testes da seleção de finalistas na interface (`cd frontend && npm test`, Node 24).
- Dez cenários funcionais da API: referências, autenticação, 108 combinações de filtros, resultados/correções, punições, backup, simulação de 480 jogos, seis classificações calculadas independentemente e validação de finalistas.
- Dois cenários adicionais: adiantar sem mudar cronograma; ciclo completo das 36 partidas finais dos dois períodos, correções, classificação independente, reconfirmação, substituição arquivada e backup antes de zerar.
- Dezessete cenários gerais de navegador e três adicionais das finais, incluindo larguras de 320, 390 e 1024 pixels. Salvamento e correção dos placares finais atualizaram a tela pública por WebSocket.
- Atualizações por WebSocket e SSE.

O arquivo `internal/domain/competition_data.json` não foi alterado. IDs, equipes, adversários, dias, períodos, quadras, modalidades, gêneros, ordem e horários das 480 partidas foram comparados durante a simulação. A publicação deve repetir essa comparação pela API pública.
