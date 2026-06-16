# Design — Escopar o `celular` a co-participantes

## Contexto apurado (workflow de entendimento)

- `users` (schema.sql:39-45): `id, nome, celular, avatar, created_at`. RLS on (1057).
- SELECT policy única: `users_select_authenticated ... using (true)` (1070-1072).
  **Sem grant de coluna** → `celular` exposto a todo `authenticated`.
- `anon` não tem policy de SELECT em `users` → lê ZERO linhas (default-deny). Embeds
  `users(...)` resolvem para `null` (objeto inteiro) quando a RLS nega — não erro.
- Helpers de participação existentes: `eh_participante(uuid)` e `eh_dono_competition(uuid)`
  — ambos `SECURITY DEFINER`, `set search_path=''`, `revoke execute from public` +
  `grant to anon, authenticated`. **Nenhum** relaciona DOIS usuários (só `auth.uid()` vs
  entidade). Precisamos de um novo predicado.
- Consumidores de `celular` (read): `getActiveMatches.ts:60-65` (embed inline),
  `getTournamentClassificacao.ts:353-358` (embed inline, só propaga p/ partidas abertas),
  `getPerfil.ts:24-28` (self). Sink único: `src/lib/whatsapp.ts` (materializa `wa.me`).
- Escrita de `celular`: `atualizarPerfil` (update self, SEM `.select()` → `return=minimal`)
  e `handle_new_user` (trigger definer, lê `raw_user_meta_data`). Ambos imunes ao revoke
  de SELECT de coluna.

## Decisão de arquitetura

Duas formas nativas de proteger SÓ o `celular`:

- **(A) Grant de coluna + RPC definer gated** — `revoke select(celular)`; expor `celular`
  por função `SECURITY DEFINER` que aplica o predicado de co-participação. **ESCOLHIDA.**
- **(B) Estreitar a row-policy** de `users` para co-participantes. **REJEITADA**: a RLS é
  por-linha; negar a linha apaga `nome`+`avatar` junto. Regressão concreta no **torneio
  público AVULSO** (nome+avatar vêm 100% de `users`) para qualquer logado não-participante;
  exigiria migrar fetchers para `users_public` + conceder coluna p/ anon — mais invasivo.

Por que **(A) é airtight**: o vazamento são (1) o `?select=celular` direto e (2) os embeds
inline. Remover `celular` dos embeds sem revogar o grant NÃO fecha (1). Revogar o grant de
coluna fecha ambos no banco; a RPC definer é o ÚNICO caminho de leitura, e ela filtra por
co-participação. `nome`/`avatar` ficam intactos porque a row-policy não muda.

### Definição de "co-participante"
`V` e `X` são co-participantes ⇔ existe um torneio em que AMBOS aparecem como dono
(`tournaments.created_by`), jogador avulso (`participants.user_id`) ou técnico de vaga
(`tournament_slots.user_id`). Cobre dono↔técnico (caso da imagem da rodada), dono↔avulso,
e participante↔participante. Vagas por-NOME (sem `user_id`) são naturalmente ignoradas.
Ligas: o técnico vira `tournament_slots.user_id` na montagem da temporada (já coberto).

## SQL (DDL)

```sql
-- 1. Predicado de co-participação (definer; molde de eh_participante)
create or replace function public.eh_co_participante(p_outro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select tournament_id from public.participants      where user_id = (select auth.uid())
      union
      select id            from public.tournaments        where created_by = (select auth.uid())
      union
      select tournament_id from public.tournament_slots   where user_id = (select auth.uid())
    ) meus
    join (
      select tournament_id from public.participants      where user_id = p_outro
      union
      select id            from public.tournaments        where created_by = p_outro
      union
      select tournament_id from public.tournament_slots   where user_id = p_outro
    ) deles using (tournament_id)
  );
$$;
revoke execute on function public.eh_co_participante(uuid) from public;
grant  execute on function public.eh_co_participante(uuid) to anon, authenticated;

-- 2. RPC gated de contato (definer; só self ou co-participante)
create or replace function public.celulares_de_contato(p_user_ids uuid[])
returns table (user_id uuid, celular text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.celular
  from public.users u
  where u.id = any (p_user_ids)
    and u.celular is not null
    and (u.id = (select auth.uid()) or public.eh_co_participante(u.id));
$$;
revoke execute on function public.celulares_de_contato(uuid[]) from public;
grant  execute on function public.celulares_de_contato(uuid[]) to authenticated;

-- 3. Grant de coluna: fecha celular, mantém nome/avatar amplos
revoke select on public.users from anon, authenticated;
grant  select (id, nome, avatar, created_at) on public.users to anon, authenticated;
```

Notas:
- `auth.uid()` é schema-qualificado (`auth.uid`), seguro sob `search_path=''`.
- `revoke select on public.users` NÃO toca UPDATE/INSERT (privilégios distintos): a
  auto-edição de `nome`/`celular` (`atualizarPerfil`, update sem `.select()`) segue válida;
  o trigger definer `handle_new_user` grava no cadastro independentemente de grants.
- **`anon` PRECISA do re-grant de coluna** (correção do gate, HIGH): o `revoke select ...
  from anon` sem re-grant faria a view órfã `users_public` (`security_invoker=true`, projeta
  `id,nome,avatar`) deixar de retornar "0 linhas pela RLS" e passar a `permission denied for
  column` para `anon`. Re-concedendo `(id,nome,avatar,created_at)` a `anon`, o baseline fica
  IDÊNTICO ao de hoje: `anon` não tem row-policy em `users` → lê ZERO linhas (a view também),
  mas sem erro de coluna. `celular` fica fora do grant para ambos os papéis.
- `avatar` é OBRIGATÓRIO no grant: além da UI ampla, `profile.ts:112,148` leem `users.avatar`
  para limpar arquivo órfão no storage. Não enxugar o grant em edição futura.

## Ordenamento (LOCAL e PROD)

**`local-grants.sql` re-expõe o problema**: ele faz `grant all on all tables ... to
authenticated` (linha 29), que re-concede `select(celular)`. Como o LOCAL carrega
`schema.sql` e DEPOIS `local-grants.sql`, o bloco do item 3 (revoke + grant de coluna)
DEVE ser repetido no FIM de `local-grants.sql` para ser o estado final. As funções (1,2)
ficam em `schema.sql` (fonte de verdade).

**Rollout em PROD (app live no Vercel) — a ordem evita derrubar o app:**
1. Aplicar **só os itens 1+2 (funções, aditivos)** ao PROD via MCP (mostrando o SQL). São
   inertes para o código antigo.
2. **Push do código** (Vercel faz deploy). O código novo chama a RPC (já existe); ainda
   não depende do revoke.
3. Confirmar deploy saudável; então aplicar o **item 3 (revoke/grant de coluna)** ao PROD
   via MCP. Só agora o `celular` fecha — e nenhum código vivo ainda seleciona a coluna.

No LOCAL, como controlo código+banco juntos, aplico 1+2+3 de uma vez e valido.

**Rollback / invariante de fail-whole-query (correção do gate):** o PostgREST ABORTA a
query INTEIRA com `42501 permission denied for column celular` se QUALQUER código vivo ainda
selecionar `celular` em embed sem grant (fail-whole-query é o padrão — não vira `null`). Logo:
- A vulnerabilidade só fecha APÓS o passo 3; aplicar o revoke imediatamente após o smoke do
  deploy minimiza a janela.
- **NÃO reverter o deploy de código (passo 2) sem antes reverter o revoke (passo 3).** Manter
  pronto o comando de rollback: `grant select (celular) on public.users to authenticated;`
  (e a anon, se necessário) — restaura o estado anterior caso seja preciso voltar o código.

**Higiene do `local-grants.sql`:** o comentário atual (linhas ~17-19) afirma que o arquivo não
reverte hardening, mas o `grant all on all tables` (linha 29) reabre `select(celular)` por
tabela. Ao anexar o bloco do item 3 no FIM, atualizar esse comentário e garantir que o bloco
seja a ÚLTIMA instrução tocando `users` (alinhado à regra de 2 passes já documentada).

## Refatoração dos fetchers (forma de injeção)

Padrão comum: após a query (sem `celular`), montar `ids` únicos dos contatos, chamar
`supabase.rpc("celulares_de_contato", { p_user_ids: ids })`, construir `Map<id, celular>`,
e reinjetar `celular` exatamente onde o downstream lê hoje (preserva os tipos/contratos).

**Invariante de reinjeção (correção do gate):** os fetchers fazem `as unknown as ...`, então
remover `celular` do `.select()` deixaria o objeto runtime SEM a chave enquanto o tipo segue
`string | null` → `undefined` mascarado pelo cast. Portanto: **manter o campo `celular` nos
tipos** (`ParticipanteEmbed.celular` em `getTournamentClassificacao.ts:193`, `VagaEmbed.tecnico.celular`
em `:207`, `ParticipanteResumo.celular`) e **materializar SEMPRE `celular: map.get(id) ?? null`**
(nunca deixar a chave ausente) para o downstream (`projetarLado:289,298`; `confrontosTextoDaRodada`;
`MatchCard`) ler `null`, não `undefined`. Lista de `ids` vazia ⇒ pular a RPC e usar `null`.

### Tipos (`database.types.ts`, hand-roll exato)
Em `Functions` (espelhar o shape de `info_convite`/`eh_participante` já existentes):
```ts
celulares_de_contato: {
  Args: { p_user_ids: string[] }
  Returns: { user_id: string; celular: string | null }[]   // ARRAY; celular nullable
}
eh_co_participante: {
  Args: { p_outro: string }
  Returns: boolean
}
```
O nome do arg DEVE ser exatamente `p_user_ids` para tipar `.rpc("celulares_de_contato",
{ p_user_ids: ids })` sem erro.

- `getActiveMatches`: contatos = `participante_1?.id`, `participante_2?.id`, e
  `vaga_1/2.tecnico?.id`. Reinjetar em `participante_1/2.celular` e `tecnico.celular`.
- `getTournamentClassificacao`: coletar ids SÓ das partidas abertas (lados que viram
  `contato`); reinjetar no `{ id, celular }` de `projetarLado`. Encerradas/chave/grupos
  permanecem sem `celular` (comportamento atual; teste existente confirma).
- `getPerfil`: `select id,nome,avatar` + `celular` de `celulares_de_contato([user.id])`.

Edge: RPC retorna só ids visíveis → ids não-co-participantes simplesmente não entram no
Map (celular fica `null`), exatamente o efeito desejado. Lista vazia de ids ⇒ pular a RPC.

## Testes (retrabalho real — correção do gate, ~30-40 linhas/arquivo)
Os 2 testes têm `montarClient` hand-rolled sem `rpc` e asserts que fixam `celular` no select.
- **Mock**: adicionar `rpc: vi.fn(async () => ({ data: c.contatos ?? [], error: null }))` aos
  dois `montarClient` (+ campo `contatos` no Cenário de cada teste).
- **Asserts de select a reescrever (tirar `celular`)**: `getActiveMatches.test.ts:166,169`
  (`tecnico:users(id,nome,avatar,celular)` → sem `celular`); `getTournamentClassificacao.test.ts:236-237,263-266`
  (`p1/p2:users(...,celular,...)` e `tecnico:users(...,celular)` → sem `celular`).
- **Fixtures**: mover o `celular` que hoje vem pelo embed (ex.: `getActiveMatches.test.ts` ~739-748)
  para o retorno da RPC (`contatos: [{ user_id, celular }]`).
- **Casos novos**: (a) COMPETITIVO — `vaga.tecnico.id` presente → RPC retorna → `tecnico.celular`
  reinjetado `!= null`; (b) RPC NÃO retorna o id → `celular` fica `null`, render não quebra;
  (c) preservar o invariante existente "histórico/encerradas não carregam celular".
