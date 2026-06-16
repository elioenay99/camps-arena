# Escopar o `celular` (PII) a co-participantes

## Why

Hoje a policy `users_select_authenticated` (`supabase/schema.sql:1070-1072`) é
`for select to authenticated using (true)` e **não há grant de coluna** em `users`.
Resultado: **qualquer usuário logado lê o `celular` (telefone) de QUALQUER outro
usuário** — direto via `GET /rest/v1/users?select=celular` e via os embeds PostgREST
das partidas. A change `add-compartilhar-rodada` (commit `17a070d`) amplificou o uso do
`celular` (monta `wa.me` por comandante na imagem/lista da rodada), o que torna o
vazamento mais relevante. Follow-up já registrado em `hardening-seguranca-supabase`
(seção *Out of scope*) e na memória do projeto.

O número de telefone só deve ser visível a quem **compartilha um torneio** com o dono
do número (o dono convoca seus participantes; o participante convoca seu adversário).

## What Changes

Princípio: **proteger SÓ a coluna `celular`, sem tocar a visibilidade de `nome`/`avatar`**.
A RLS do Postgres é por-linha, não por-coluna; estreitar a row-policy de `users`
regrediria nomes/fotos em **torneios públicos avulsos** (onde nome+avatar vêm 100% de
`users`). Por isso a proteção é por **grant de coluna + RPC gated**, mantendo
`using (true)` para `nome`/`avatar`.

DDL (espelhada em `supabase/schema.sql` + `supabase/local-grants.sql`; promovida ao PROD
via MCP mostrando o SQL — REGRA 4):

1. **Predicado `public.eh_co_participante(p_outro uuid) → boolean`** — `SECURITY DEFINER`,
   `stable`, `set search_path=''` (mesmo molde de `eh_participante`/`eh_dono_competition`,
   obrigatório para não recursar na RLS). Verdadeiro quando `auth.uid()` e `p_outro`
   aparecem no MESMO torneio por qualquer um dos caminhos de pertencimento:
   `participants.user_id` (avulso), `tournaments.created_by` (dono),
   `tournament_slots.user_id` (técnico de clube / por-nome). `revoke execute from public`
   + `grant execute to anon, authenticated` (NÃO revogar de `authenticated` — lição
   queimada: helper de RLS exige EXECUTE do papel da query).

2. **RPC `public.celulares_de_contato(p_user_ids uuid[]) → table(user_id uuid, celular text)`**
   — `SECURITY DEFINER`, `stable`, `set search_path=''`. Devolve o `celular` de um id
   APENAS quando `id = auth.uid()` (self) OU `eh_co_participante(id)`. `grant execute to
   authenticated` (anon nunca precisa de contato; nem alcança o `/dashboard`).

3. **Grant de coluna em `public.users`**: `revoke select on public.users from anon,
   authenticated` + `grant select (id, nome, avatar, created_at) on public.users to anon,
   authenticated`. Fecha o `?select=celular` e os embeds inline; mantém `nome`/`avatar`
   amplos (a row-policy `using(true)` continua). O re-grant inclui `anon` para preservar o
   baseline da view órfã `users_public` (sem ele, `anon` tomaria `permission denied for
   column` em vez de "0 linhas pela RLS"). UPDATE/INSERT de coluna intactos (auto-edição de
   `nome`/`celular` segue funcionando; o cadastro grava via trigger definer `handle_new_user`).

Código (Next.js): tirar `celular` dos embeds e buscá-lo pela RPC nos 3 consumidores:

4. **`getActiveMatches.ts`** — remover `celular` dos 4 embeds (`participante_1/2`,
   `tecnico` em `vaga_1/2`); após carregar, coletar os ids de contato, chamar
   `celulares_de_contato` 1× e reinjetar `.celular` na forma que o `MatchCard` consome.

5. **`getTournamentClassificacao.ts`** — remover `celular` dos 4 embeds (`p1/p2`,
   `tecnico` em `v1/v2`); reinjetar o `celular` SÓ nos lados das **partidas abertas**
   (único ponto que hoje propaga o número; `projetarLado`/`contato`).

6. **`getPerfil.ts`** — `.select("id, nome, avatar")` + `celular` do próprio usuário via
   `celulares_de_contato([user.id])` (branch self).

7. **`database.types.ts`** — hand-roll das 2 funções novas em `Functions`.

### Mantido por design (NÃO mexer)
- Row-policy `users_select_authenticated using(true)` — preserva `nome`/`avatar` amplos.
- View órfã `users_public` (id/nome/avatar) — segue como está; não é o caminho do fix.
- Escrita de `celular`: `atualizarPerfil` (update self, sem `.select()`) e o trigger
  `handle_new_user` (definer) — ambos imunes ao revoke de SELECT de coluna.

## Out of scope
- Mover telas públicas de torneio para `users_public` (caminho alternativo, mais
  invasivo, descartado — ver `design.md`).
- Toggle `leaked_password_protection` (segue na change `hardening-seguranca-supabase`).

## Impact
- Specs: `row-level-security` (escopo de PII por co-participação) e `match-engagement`
  (atalho de convocação passa a depender de co-participação).
- DDL em LOCAL (psql/`supabase`) para dev/validação + PROD via MCP (sequência de rollout
  no `design.md` para não quebrar o app live) + espelho em `schema.sql`/`local-grants.sql`.
- Código: 3 fetchers + types + testes. Sem mudança de UX para co-participantes; um
  logado não-participante deixa de ver telefones (mas segue vendo nomes/placares).
- Validação: ao vivo no LOCAL (390px, 2 contas) — co-participante vê o `wa.me`;
  não-participante de torneio público vê nomes mas NÃO o telefone; `?select=celular`
  direto negado.
