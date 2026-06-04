# Design — add-match-history

## Contexto

`getTournamentClassificacao` já busca TODAS as partidas do torneio com nomes embutidos para o motor. O histórico é outra projeção do MESMO dado — estender o fetcher evita uma segunda viagem e mantém classificação e histórico sempre consistentes entre si (mesmo snapshot).

## Decisões

### D1 — Uma query, duas projeções

O select de partidas ganha `id` (key de lista) e `updated_at` (data de encerramento) e passa a ordenar por `updated_at` desc. O motor ignora campos extras (recebe o array como está — `PartidaClassificavel` é subconjunto estrutural) e é insensível à ordem das partidas (acumuladores comutativos; desempate ordena depois). `partidasEncerradas` filtra `status === "encerrada"` e mapeia para o shape de exibição.

### D2 — `updated_at` como "encerrada em"

Não existe coluna `encerrada_em`; a partida encerra no último lançamento de placar, então `updated_at` é a aproximação honesta. Limitação documentada: um UPDATE posterior qualquer move a data. Coluna dedicada só se o lifecycle de partida ganhar transições explícitas.

### D3 — Histórico INCLUI partida encerrada sem participante

Diferente do motor (que exige os dois lados para pontuar), o histórico é um REGISTRO: partida encerrada com lado nulo aparece com "A definir" (fallback do MatchCard). Esconder seria mentir sobre o que existe no torneio. (Caso raro — encerrar sem participantes — mas possível no modelo.)

### D4 — Data formatada no servidor, pt-BR

`Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" })` no RSC. Timezone fixo do produto (app pt-BR, público brasileiro) — sem ele o servidor formataria em UTC e a data viraria "amanhã" à noite. Por-usuário só quando houver perfil com timezone.

### D5 — Seção omitida quando vazia

Sem encerradas, a seção não renderiza — o estado vazio da classificação ("aparece depois da primeira partida encerrada") já comunica o mesmo fato; duas mensagens vazias na mesma tela seria ruído.

## Riscos

- **Volume**: tudo do torneio numa query — mesmo trade-off já aceito na classificação (D7 da change anterior); paginação se houver dor.
- **`updated_at` impreciso**: aceito (D2).
