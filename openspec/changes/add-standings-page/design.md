# Design — add-standings-page

## Contexto

O motor é puro e está pronto; falta a fatia de leitura. Sem tabela `participants`, a classificação lista quem aparece em partidas encerradas do torneio (decisão herdada do D4 do scoring-rules).

## Decisões

### D1 — Duas queries no fetcher (torneio + partidas), uma viagem por recurso

`tournaments` por id (`maybeSingle`) e `matches` por `tournament_id` com embeds `users!matches_participante_*_fkey (id, nome)`. Selecionar a COLUNA `participante_1` E o embed aliased na mesma query é suportado pelo PostgREST — o motor usa os uuids, o mapa de nomes usa os embeds. Não embutir partidas dentro do torneio numa query só: o shape ficaria acoplado e o erro de RLS indistinguível.

### D2 — Torneio invisível = inexistente

RLS oculta torneio privado de terceiro → `maybeSingle` devolve `null` → fetcher devolve `null` → página chama `notFound()`. Mesma resposta para id inexistente: sem oráculo de existência (consistente com a decisão D4 do match-creation).

### D3 — uuid validado antes da query

`z.uuid().safeParse(id)` na página; inválido → `notFound()` imediato. Evita transformar lixo de URL em erro 22P02 do PostgREST (que viraria 500/error.tsx — resposta errada para URL malformada).

### D4 — Tabela RSC pura, sem client

A tabela só exibe dados; nenhum estado/interação → zero `"use client"` (RSC-first do projeto). `<table>` nativa (shadcn Table não está instalado — consistente com select/checkbox nativos das changes anteriores), `tabular-nums` para alinhamento numérico, `scope="col"`/`caption` para a11y.

### D5 — Nome do participante com fallback

Mapa `id → nome` vem dos embeds; participante sem nome (`null`/vazio) vira "Sem nome" (mesmo fallback do MatchCard). Participante presente no motor mas ausente do mapa (impossível em prática — o embed vem da MESMA linha) vira o próprio fallback, sem quebrar.

### D6 — Link no MatchCard, não botão novo

O subtítulo já mostra o título do torneio; ele vira link (área de toque natural, zero poluição visual). `getActiveMatches` ganha `id` no embed do tournament — mudança aditiva no tipo.

## Riscos

- **Torneio com muitas partidas**: o fetch traz todas as partidas do torneio (sem paginação). Aceitável no MVP (dezenas de partidas); materialização/paginação só se houver dor real.
- **Partidas privadas parcialmente visíveis**: a RLS de `matches` pode esconder linhas de um torneio visível? Não no modelo atual — se o torneio é visível ao usuário, TODAS as partidas dele satisfazem a cláusula do torneio na policy. Cláusula de participante só ADICIONA visibilidade. Classificação nunca é calculada com subconjunto.
