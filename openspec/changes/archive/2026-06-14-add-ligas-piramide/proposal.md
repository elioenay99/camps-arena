# Proposal — add-ligas-piramide

## Why

O usuário quer um formato NOVO e ambicioso: **ligas com acesso e rebaixamento** —
uma **pirâmide de N divisões** onde se configura quantos times **sobem** e quantos
**caem** entre cada par de divisões, **multi-temporada** (ao fim da temporada os
times sobem/caem e a próxima temporada é remontada), com **competidores por nome
OU por clube** (toggle por divisão). Pesquisamos os formatos reais do futebol
mundial (direto, playoffs de acesso/playout, barragem cruzada, promedios,
Apertura/Clausura) — a variedade vira as **opções de configuração**. O usuário
pediu o formato **máximo configurável** e quer o **conjunto completo entregue de
uma vez** (não incremental ao usuário, mas construído por fases internamente).

## What Changes

Introduz a **PIRÂMIDE** como entidade-mãe acima do modelo atual de torneio, com
**reúso máximo do motor existente**: cada **divisão de uma temporada É um
`tournaments` de `formato='liga'`** — então `gerarTabelaLiga`, `computeStandings`,
`tournament_slots`, `matches`, convites, RPCs de vaga e RLS **funcionam sem tocar
no motor**. A camada nova é fina (6 tabelas) e só orquestra acima.

- **Modelo novo** (6 tabelas): `league_competitions` (pirâmide imortal + config),
  `league_seasons` (temporada, snapshot de config), `league_division_seasons`
  (divisão → aponta para um `tournaments`), `league_boundaries` (regra sobe/cai +
  playoff por fronteira), `league_competitors` (competidor persistente que migra),
  `league_division_entries` (histórico por temporada). + coluna `competitor_id`
  (nullable) em `tournament_slots`.
- **Motor**: `computeStandings` ganha um parâmetro de **desempate** (presets
  `cbf`/`ingles`/`espanhol`/`custom`) montando a cadeia de comparadores — única
  refatoração, default `cbf` preserva o comportamento atual.
- **Ciclo de temporada**: orquestração de aplicação — encerrar divisões →
  `computeStandings` → calcular sobe/cai (posição/PPG/promedios) → resolver
  fronteiras → **gerar a próxima temporada** com os mesmos competidores
  realocados (conserva o tamanho). Mostra o fluxo ANTES de commitar (2 cliques).
- **UI**: wizard de criação mobile-first com **presets** (Brasileirão 4-4 / Premier
  3-3 / Personalizado), página da temporada com abas de divisão (cada uma linka a
  página de torneio EXISTENTE), `StandingsTable` com zona sobe/cai, tela de fluxo,
  página do competidor (histórico).

### Decisões de produto (confirmadas com o usuário)
- **Entrega**: construir TODAS as fases antes de entregar ao usuário.
- **Técnico**: ACOMPANHA o competidor ao subir/cair (mantém o elenco entre temporadas).
- **Toggle nome/clube**: POR DIVISÃO (pode misturar na mesma pirâmide).
- **Empate exato na zona de corte**: SORTEIO crypto registrado, com opção do dono
  ajustar manualmente antes de confirmar a próxima temporada.
- **Defaults adotados**: divisões da temporada rodam em PARALELO (fluxo só quando
  todas encerram); fronteira SIMÉTRICA por padrão (assimétrica com aviso);
  temporada N TRAVA ao gerar N+1.

## Capabilities

Nova capability **`league-pyramid`** (modo pirâmide com acesso/rebaixamento
multi-temporada). Reaproveita as capabilities `league-format`, `standings-engine`,
`club-slots`, `standings-page`, `tournament-lifecycle` (cada divisão é um torneio
de liga). NÃO altera o comportamento dos torneios legados (tudo aditivo/nullable).

## Impact (fases — construir tudo antes de entregar)

- **Fase 0** — DDL fundacional (6 tabelas + enums + RLS + lock triggers +
  `competitor_id`) em `supabase/schema.sql`; regenerar `database.types.ts`;
  `computeStandings` parametrizável por desempate (presets testados). Aditivo —
  nada quebra nos torneios legados.
- **Fase 1** — Fundação ponta-a-ponta: `createCompetition` (wizard+presets),
  `montarTemporada` (cria N torneios de liga + slots + entries + competitors),
  reúso de `iniciarTorneio` por divisão, página da temporada, `StandingsTable` com
  zona sobe/cai, `executarFluxoTemporada` (base posição+PPG, fronteira DIRETA
  simétrica, sorteio crypto no empate), montar próxima temporada (técnico
  acompanha), toggle nome/clube por divisão. RLS+lock completos.
- **Fase 2** — playoff de acesso interno + playout interno (reúsa `gerarChaveMataMata`).
- **Fase 3** — barragem cruzada (X de d × Y de d+1).
- **Fase 4** — base de cálculo promedios (plurianual) + página do competidor.
- **Fase 5** — ciclos alternativos (Apertura/Clausura, split), formato interno por
  divisão (grupos+mata-mata), desempate `custom`.

- **DDL em produção**: aplicada por mim via MCP mostrando o SQL antes
  ([[feedback-mcp-autonomia]] + REGRA 4); provável uso de **branch Supabase** para
  desenvolver o esquema grande antes de mesclar. Aditivo/nullable — seguro.
- **Risco**: ALTO (feature grande, novo modelo de dados). Mitigado pelo reúso
  máximo (motor intocado), fases ponta-a-ponta, e gates/revisão adversarial por
  fase. Pontos de atenção: conservação de tamanho no fluxo; idempotência do
  promote-first ao gerar temporada; RLS das 6 tabelas; mobile-first na config
  (presets resolvem 90%).
