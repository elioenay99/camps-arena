## Context

`tournaments` hoje: `id`, `titulo`, `status` (`rascunho|ativo|encerrado`, default `ativo`), `created_at`. RLS = `tournaments_select_public using (true)` + escrita negada (sem policy). `matches.tournament_id` é `NOT NULL` com `ON DELETE CASCADE` e `getActiveMatches` embute `tournaments!matches_tournament_id_fkey!inner`. O perfil `public.users` é 1:1 com `auth.users` (mesmo `id`), então `auth.uid()` casa com `users.id`.

## Goals / Non-Goals

- **Goals**: torneio com dono; criação self-service segura (RLS + action); zero regressão no dashboard atual.
- **Non-Goals**: UI de edição/encerramento (RLS já habilita; tela depois); criação de partida (Tier 1c); listagem "meus torneios"; participantes/convites (Tier 3).

## Decisions

### 1. `created_by` anulável com `ON DELETE SET NULL`

Simétrico a `matches.participante_*`. Anulável porque torneios semeados/legados não têm dono e não devem quebrar a constraint; `set null` (em vez de `cascade`) evita que apagar um usuário leve junto torneios com histórico de partidas. A action sempre preenche `created_by` para torneios novos.

### 2. `is_public` default `true` — preserva o comportamento atual

Os torneios semeados não têm a coluna; com `default true` eles continuam visíveis a todos e o dashboard não muda. Default `false` esconderia os semeados e exigiria backfill manual. A visibilidade restritiva real começa a importar quando houver torneios privados criados pela app.

### 3. RLS de SELECT: `is_public OR created_by = auth.uid()`

Para `anon`, `auth.uid()` é `NULL` → vê apenas `is_public`. Para `authenticated`, vê públicos + os seus privados. Como `getActiveMatches` usa `!inner` no embed de `tournaments`, a RLS do torneio governa a visibilidade da partida: partida de torneio privado de terceiro some — exatamente o desejado.

### 4. Posse imutável via `with check`

INSERT e UPDATE exigem `created_by = auth.uid()` no `with check`: ninguém cria torneio em nome de outro nem transfere a posse num UPDATE. DELETE só do dono. Espelha o padrão `users_update_self`/`matches_update_participant`.

### 5. `createTournament` seta `created_by` no servidor

A action lê `auth.getUser()` e usa `user.id` — o cliente nunca informa o dono. Mesmo que informasse, o `with check` da RLS barraria. Dupla barreira coerente com o resto do projeto.

### 6. UI mínima viável

Página `/dashboard/torneios/novo` (RSC protegida pelo middleware + checagem na própria RSC, como o dashboard) + `TournamentForm` (folha `"use client"` com `useActionState`/`useFormStatus`, Input/Label/Button do design system). Não há `Checkbox` do shadcn no projeto — usa-se `<input type="checkbox">` nativo estilizado com tokens do design system (`accent-primary`), evitando nova dependência Radix. Sem React Hook Form (1–2 campos). Checkbox "Torneio público" marcado por padrão (reflete o default `true`).

## Risks / Trade-offs

- **Esconder partidas via RLS do torneio**: efeito colateral do `!inner`. É o comportamento correto, mas vale o registro — quando criação de partida (Tier 1c) chegar, um torneio privado isola suas partidas automaticamente.
- **DDL manual**: a RLS nova só vale após o usuário aplicar `schema.sql`. Até lá, a action `createTournament` falharia o INSERT (RLS antiga nega escrita) — por isso a UI só é útil após a migration. Registrado em `docs/pendencias-manuais.md`.
- **`status` no create**: torneio nasce `ativo` (default do banco); a action não expõe `status` (lifecycle é transversal futuro).
- **Privacidade NÃO cobre `matches` ainda**: a confidencialidade do torneio privado vale para o caminho do embed `!inner` em `getActiveMatches`, mas `matches_select_public` segue `using (true)` — uma leitura direta de `matches` por `tournament_id` exporia placar/participantes de um torneio privado. **Risco latente hoje** (não há policy de INSERT em `matches` nem action que crie partida, e todos os torneios semeados são `is_public = true`, logo não existe partida em torneio privado). **O Tier 1c (criação de partida) DEVE estreitar a policy de `matches`** para refletir a visibilidade do torneio antes de existir partida privada.
