## Context

Fluxo de clube (capability `team-search`): `searchTeams` consulta a API-Football,
`selectTeam` cacheia o clube na tabela global `teams`, `updateMatchTeams` associa
`time_1/2` à partida. A varredura confirmou três vetores (ver proposal). Restrições do
projeto: DDL é manual (`supabase/schema.sql` é a fonte; o usuário aplica), segredos só
server-side, RLS estrita. `next.config.ts` já restringe `next/image` a
`media.api-sports.io/football/teams/**`.

## Goals / Non-Goals

**Goals:**
- Remover o vetor de DoS anônimo em `searchTeams`.
- Impedir poison do cache global `teams` com `escudo_url`/`nome` arbitrários.
- Impedir o mesmo clube nos dois lados da partida.
- Defesa em profundidade: validação na Server Action **e** CHECK constraint no banco.

**Non-Goals:**
- Rate-limit por usuário autenticado em `searchTeams` (auth já elimina o vetor anônimo,
  que é o crítico; throttle por usuário fica como follow-up, exige infra de Redis ainda
  inexistente).
- Fechar totalmente o `with check(true)` da RLS de INSERT em `teams` (o INSERT é o
  mecanismo de cache; as CHECK constraints + validação na action cobrem o vetor real).
- Mexer no fluxo de placar (`updateMatchScore`) ou em outras capabilities.

## Decisions

### D1 — `searchTeams`: exigir sessão (não rate-limit)
Adicionar `auth.getUser()` no topo de `searchTeams`, retornando o erro padrão
"Você precisa estar autenticado." quando não houver sessão. Alternativa (rate-limit por
IP) preservaria chamadas anônimas, mas exige Redis/Upstash não provisionado e é mais
frágil em serverless. Como o **único caller de UI é o modal autenticado** (o demo público
não renderiza a busca), exigir auth não tem custo de UX e fecha o vetor anônimo por
completo. `selectTeam` já exige auth — fica consistente.

### D2 — `selectTeam`: allowlist de domínio do escudo + limites de entrada
Endurecer `selectTeamSchema` (`teamSchema.ts`):
- `escudoUrl`: `null` **ou** URL `https` cujo host seja exatamente `media.api-sports.io`
  (mesma origem confiável do `next.config.ts`). Validar via `z.string().url()` +
  refine de host/protocolo (não regex frágil). URL fora do domínio → rejeitada (entrada
  inválida).
- `nome`: `min(1).max(80)` (corta defacement com texto longo).
- `externalId`: `regex(/^\d+$/)` (ids da API-Football são numéricos).
Como `searchTeams` agora exige auth e só expõe dados normalizados da API, o vetor real é
o POST direto a `selectTeam` com payload forjado — a validação acima o fecha.

### D3 — `updateMatchTeams`: rejeitar mesmo clube nos dois lados
O patch pode setar só um lado, então a checagem precisa do estado atual: estender o
`select` (que já busca a partida para autorização) para incluir `time_1, time_2`,
compor o par resultante (atual sobrescrito pelo patch) e rejeitar quando ambos os lados
ficarem com o **mesmo** clube (não-nulo). Mensagem clara ("Os dois lados não podem ter o
mesmo clube."). Existência do clube já é garantida pela FK.

### D4 — Defesa em profundidade no banco (DDL manual)
Adicionar a `supabase/schema.sql` (idempotente, o usuário aplica):
- `teams`: `CHECK (escudo_url IS NULL OR escudo_url LIKE 'https://media.api-sports.io/%')`.
- `matches`: `CHECK (time_1 IS NULL OR time_2 IS NULL OR time_1 <> time_2)`.
Constraints são a segunda barreira caso uma escrita escape da action. Adição via
`ALTER TABLE ... ADD CONSTRAINT` com nome próprio, guardada por `IF NOT EXISTS` onde o
Postgres permitir (senão `DROP CONSTRAINT IF EXISTS` + `ADD`).

## Risks / Trade-offs

- **CHECK de `escudo_url` vs dados legados** → se algum registro em `teams` tiver
  `escudo_url` fora do domínio, o `ALTER TABLE ADD CONSTRAINT` falha. Mitigação:
  conferir `select count(*) from teams where escudo_url is not null and escudo_url not like 'https://media.api-sports.io/%'`
  antes de aplicar; limpar/normalizar se houver. Documentado na task de DDL.
- **Allowlist divergir do `next.config.ts`** → se o domínio do CDN mudar num lado e não
  no outro, escudos quebram ou viram inválidos. Mitigação: um único valor de verdade
  (host `media.api-sports.io`) referenciado em ambos; comentar o acoplamento.
- **Testes existentes que chamam `searchTeams` sem auth** → passam a precisar de mock de
  sessão; atualizar `teams.test.ts`. Risco baixo (mock de Supabase já existe na suíte).
- **DDL não aplicada automaticamente** → até o usuário rodar o `schema.sql`, só a
  validação na action protege (já suficiente para o vetor); a constraint é reforço.

## Migration Plan

1. Mudanças de código (Zod + actions) funcionam sem DDL e já fecham os vetores via
   aplicação. CI verde local + remoto.
2. **Ação do usuário (DDL)**: conferir dados legados de `teams.escudo_url`; aplicar as
   duas CHECK constraints do `schema.sql` no Supabase (SQL Editor).
3. Rollback: reverter o código restaura o comportamento anterior; `DROP CONSTRAINT`
   remove as checagens do banco. Sem migração de dados destrutiva.
