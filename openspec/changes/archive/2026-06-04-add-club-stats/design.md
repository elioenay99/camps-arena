# Design — add-club-stats

## Contexto

O motor `computeStandings` é agnóstico ao significado do id: recebe lados + placares + status e devolve a tabela. A classificação de clubes é a MESMA computação chaveada por `time_*`. Terceira projeção da mesma query (padrão estabelecido no match-history).

## Decisões

### D1 — Re-chavear, não duplicar

As partidas vão ao motor uma segunda vez com `participante_1: time_1, participante_2: time_2`. Elegibilidade cai de graça: partida sem os DOIS clubes definidos tem lado nulo → não pontua na tabela de clubes (correto: não dá para atribuir o resultado a um confronto de clubes). O guard de self-match cobre dado corrompido (espelho da CHECK `matches_times_distintos`).

### D2 — Mesmas regras de pontuação do torneio

Os pontos do clube usam `pontos_vitoria/empate/derrota` do torneio — é a leitura natural ("o Flamengo somou X pontos NESTE campeonato") e mantém uma única fonte de regras. Confronto direto entre clubes também herda a semântica (entre exatamente 2).

### D3 — Reusar `StandingsTable` como está

`LinhaComNome` serve para clube (nome no lugar do participante). Sem coluna de escudo por enquanto — o componente é textual e a tabela de 10 colunas já está no limite do mobile; escudo é polimento futuro (registrado em Fora de escopo).

### D4 — Seção "Clubes" omitida quando vazia

Clube é opcional por partida; muitos torneios não terão nenhum. Seção só aparece com ao menos um clube pontuado (mesma decisão do histórico — sem mensagens vazias acumuladas).

### D5 — Nome do clube sem fallback "Sem nome"

`teams.nome` é `not null` no schema; o fallback (defensivo) usa o próprio padrão `nomeOuFallback` por consistência, mas o caso é teoricamente inalcançável.

## Riscos

- **Participantes trocam de clube entre partidas**: as estatísticas do clube agregam partidas de participantes diferentes — comportamento desejado (é a tabela DO CLUBE, não do par participante+clube).
- **Tabela longa na página**: três seções (classificação, histórico, clubes) — aceitável; tabs só se a página crescer mais.
