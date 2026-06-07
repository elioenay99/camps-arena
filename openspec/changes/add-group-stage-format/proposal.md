# Proposal — add-group-stage-format

## Why

Os dois últimos formatos do roadmap — **Grupos + mata-mata** (Copa do Mundo) e
**Fase de liga + mata-mata** (Champions) — são COMPOSIÇÃO dos dois motores
puros que já existem: round-robin (`gerarTabelaLiga`) dentro de cada grupo e
chave eliminatória (`gerarChaveMataMata`) para os classificados, com
`computeStandings` rodando por subconjunto (grupo) sem mudança. A fase de
liga é o caso G=1 do mesmo motor (decisão do usuário: incluir de carona, com
rótulo próprio). Decisões de produto fechadas via AskUserQuestion
(2026-06-07): grupos/classificados definidos AO INICIAR; distribuição pelos
TRÊS modos (sorteio, potes, manual); empate na linha de corte resolvido por
SORTEIO automático com aviso.

## What Changes

- Enum `tournament_format` ganha `'grupos_mata_mata'` e `'fase_liga'`
  (aditivo; ambos nascem em rascunho, adesão por convite).
- `tournaments` ganha `classificados_por_grupo` (int anulável, gravado AO
  INICIAR — o "Gerar mata-mata" precisa dele depois). `ida_e_volta` vale nos
  grupos (dois turnos) E na chave (final/3º sempre jogo único);
  `terceiro_lugar` vale para a chave — ambos reusados.
- `matches` ganha `grupo` (int anulável, CHECK >= 1, mutuamente exclusivo com
  `posicao` — partida de grupo = `grupo`+`rodada`; partida de chave =
  `posicao`+`rodada`(+`perna`); travado no `lock_match_relations`).
- **Rodada CONTÍNUA**: a chave numera rodadas APÓS as dos grupos — sem isso,
  na fase de liga (G=1) um confronto da chave que repete um par do grupo na
  mesma rodada colidiria no índice `matches_liga_par_unico`. O motor knockout
  ganha rodada-base derivada (menor rodada das partidas com `posicao`).
- Novo motor PURO `src/features/groups/`: montagem dos grupos por modo
  (equilíbrio máx ±1), geração das partidas compondo `gerarTabelaLiga` por
  grupo, classificação com sorteio de linha de corte (randInt injetado),
  cruzamento determinístico (G=1: bracket seeding 1×K, 2×K−1, com 1 e 2 em
  metades opostas; G≥2: padrão Copa A1×B2 | C1×D2 ‖ B1×A2 | D1×C2), prévia.
- Restrições: total de classificados G·K ∈ {2, 4, 8, 16, 32} (implica G ∈
  {1, 2, 4, 8}); `fase_liga` fixa G = 1; potes exigem 1 cabeça por grupo.
- Novas actions: `iniciarTorneioGrupos(prev, formData)` (G/K/modo no painel;
  PROMOVE atomicamente ANTES do INSERT — serialização da corrida, ver D6b —
  gravando `classificados_por_grupo`; recuperação de crash por rebaixamento
  atômico) e `gerarMataMataDosGrupos(tournamentId)` (grupos completos →
  classifica → cruza → INSERT da chave em rodadas contínuas; pré-checagem de
  semeados; 23505; avisa quando houve sorteio de desempate).
- `avancarFase` GENERALIZADA para os três formatos com chave (mata-mata,
  grupos, fase de liga), operando nas partidas com `posicao` e rodada-base.
- Congelamento de participants ESTENDIDO aos formatos novos (a chave futura
  depende de `participants` desde o `ativo` — mesma lição do mata-mata):
  action + policy + UI. `aceitar_convite`/`createMatch`/policy de INSERT já
  cobrem (regras genéricas `<> 'avulso'` / `rodada is not null`).
- Trigger `valida_resultado_mata_mata` passa a cobrir os três formatos com
  chave (gate por formato estendido; regras continuam só nas partidas de
  chave — empate em jogo de GRUPO segue permitido).
- UI: `TournamentForm` com os 2 radios novos; página do torneio renderiza uma
  `StandingsTable` por grupo (Grupo A/B/…; na fase de liga, "Classificação")
  + `BracketView` da chave quando gerada + painel de início próprio (G, K,
  modo, prévia) + botão "Gerar mata-mata".
- DDL manual: **seção 12** das pendências (ALTER TYPE ×2 em Run separado +
  colunas + CHECKs + lock + trigger + policy). **Sem ela, criar torneio pela
  app NÃO falha** (formatos novos só aparecem com o enum), mas os formatos
  novos ficam indisponíveis.

## Capabilities

### New Capabilities

- `group-stage-format`: formatos Grupos+mata-mata e Fase de liga — montagem
  de grupos em três modos, round-robin por grupo, classificação com sorteio
  de corte, cruzamento determinístico, chave em rodadas contínuas,
  visualização por grupo + chave.

### Modified Capabilities

- `data-model`: enum +2 valores, `tournaments.classificados_por_grupo`,
  `matches.grupo` + CHECKs.
- `row-level-security`: lock de `grupo`; trigger de resultado cobre os
  formatos com chave; policy de DELETE de participants estendida.
- `tournament-management`: criação aceita os formatos novos (nascem em
  rascunho; opções normalizadas).
- `tournament-participants`: congelamento de sair/remover estendido aos
  formatos com chave.
- `standings-page`: página varia também para os formatos novos (tabelas por
  grupo + chave).
- `knockout-format`: motor/avancarFase generalizados por rodada-base (chave
  pode começar em qualquer rodada).

## Impact

- **Banco (DDL manual)**: seção 12 — 2 valores de enum, 2 colunas, CHECKs,
  `lock_match_relations`, `valida_resultado_mata_mata`, policy de participants.
- **Actions**: `tournaments.ts` (+2 actions, `avancarFase` generalizada,
  `createTournament` aceita os formatos), `participants.ts`
  (`chaveEmAndamento` estendida).
- **Features**: novo `src/features/groups/` (motor + testes); knockout ganha
  rodada-base; página do torneio + `TournamentForm` + painéis.
- **Não muda**: `gerarTabelaLiga` e `computeStandings` (compostos como estão),
  fluxo de convite, dashboard, policy de INSERT de matches.
- **Compat**: formatos existentes intocados; colunas novas nulas em tudo que
  existe.
