## Why

A varredura de segurança confirmou, lendo o código vivo, três vetores no fluxo de clube:

1. **DoS de custo externo** — `searchTeams` (`src/actions/teams.ts:54`) é Server Action **pública sem autenticação**. Como Server Actions são endpoints HTTP, qualquer um na internet pode invocá-la via POST direto e, variando o termo, **esgotar a cota grátis da API-Football (~100/dia)**, derrubando a busca para todos. O cache de 24h só cobre termos idênticos.
2. **Poison do cache compartilhado** — `selectTeam` (`teams.ts:142`) grava `nome`/`escudo_url` **arbitrários** numa tabela **global** (`teams`, visível a todos) sem allowlist de domínio (`selectTeamSchema` valida só `escudoUrl: string nullable`; RLS é `with check(true)`). Qualquer logado pode poluir/spoofar o cache — e contaminar a futura feature de "stats por clube".
3. **Mesmo clube nos dois lados** — `updateMatchTeams` (`match.ts:115`) e o schema não impedem `time_1 == time_2`.

São fixes baratos e de defesa em profundidade no fluxo que o roadmap vai expandir.

## What Changes

- **`searchTeams` passa a exigir sessão** (`auth.getUser()`). **Sem impacto no demo público**: a busca (`TeamSearchInput`) só é renderizada quando `onSelecionarClube` é passado (`MatchScoreModal.tsx:212`), e o demo (`page.tsx:47`) não o passa — só o dashboard autenticado usa a busca.
- **`selectTeam` endurece a validação de entrada**: `escudoUrl`, se presente, SHALL ser URL `https` no domínio confiável `media.api-sports.io` (espelha `next.config.ts`); `nome` ganha limite de tamanho; `externalId` restrito a dígitos. Entradas fora disso são rejeitadas — fecha o poison do cache.
- **`updateMatchTeams` rejeita o mesmo clube nos dois lados** (considerando valores atuais + patch).
- **DDL (defesa em profundidade no banco; usuário aplica `schema.sql` manualmente)**: CHECK em `teams.escudo_url` (domínio confiável ou nulo) e CHECK em `matches` (`time_1 is null or time_2 is null or time_1 <> time_2`).
- **Testes** cobrindo: rejeição de não-autenticado em `searchTeams`, rejeição de `escudo_url` forjado em `selectTeam`, rejeição de mesmo clube em `updateMatchTeams`.

## Capabilities

### New Capabilities
<!-- Nenhuma. -->

### Modified Capabilities
- `team-search`: `searchTeams` exige autenticação; `selectTeam` valida o domínio do escudo e limita a entrada; associação de clube rejeita o mesmo clube nos dois lados da partida.

## Impact

- **Código**: `src/actions/teams.ts` (auth em `searchTeams`), `src/schema/teamSchema.ts` (allowlist de domínio em `escudoUrl` + limites), `src/actions/match.ts` (validação `time_1 <> time_2`).
- **Testes**: `src/actions/teams.test.ts`, `src/actions/match-teams.test.ts` (e o que mais tocar nesses contratos).
- **Banco (DDL manual)**: `supabase/schema.sql` — duas CHECK constraints. **needs_db = true**; o usuário aplica no Supabase.
- **Não-impacto**: demo público (busca só aparece autenticada); existência do team referenciado já é garantida pela FK `matches.time_1/2 → teams(id)`.
- **Risco**: a CHECK de `escudo_url` pode rejeitar registros legados com URL fora do domínio — conferir/limpar `teams.escudo_url` existentes **antes** de aplicar a constraint. A allowlist deve casar exatamente com `next.config.ts` (`media.api-sports.io`).
- **Fora de escopo (follow-up)**: rate-limit por usuário autenticado em `searchTeams` (auth já remove o vetor anônimo, que é o crítico); fechar totalmente o `with check(true)` da RLS de `teams` (as CHECK constraints + validação na action já cobrem o vetor real).
