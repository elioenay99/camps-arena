# Design — add-equipe-campeonato (v2, pós-gate `wop4hm591`)

> Revisado após gate adversarial `changes_required` (9 must_fix confirmados em código + 8
> should_fix). Mudanças desta revisão estão marcadas **[gate]**.

## 1. Objetivo e princípios

Delegar a operação de um campeonato a uma **equipe** com papéis, sem afrouxar a posse. O
dono permanece supremo. Tudo é modelado por **capacidades** verificadas no banco (RLS +
triggers, fonte da verdade), espelhadas no app-layer e na **visibilidade** (SELECT).

Invariantes de segurança (não-negociáveis):
1. **Apagar** (DELETE de `tournaments`/`league_competitions` **e das tabelas-filhas de
   liga** — seasons/divisões/competidores/entries/boundaries) é **dono-only**. **[gate]**
2. **Reverter status** — reabrir (`encerrado`→aberto) E rebaixar (`ativo`→`rascunho`) — é
   **dono-only**, por **trigger**, não só pela action. **[gate]**
3. **Virar a temporada da liga** (confirmar sobe/cai + montar próxima temporada) é
   **dono-only** — é irreversível por ninguém, nem pelo dono (decisão do dono 2026-06-21).
   **[gate]**
4. **Criar/promover admin** é **dono-only**; admins gerem apenas árbitros/moderadores
   (decisão do dono 2026-06-21). **[gate]**
5. Helpers de RLS (existentes e novos) **mantêm EXECUTE para anon+authenticated**. Revogar
   quebra a RLS (lição [[arena-seguranca-supabase]]).
6. **Visibilidade acompanha a capacidade**: quem pode arbitrar/moderar/gerir SHALL poder
   **ler** (SELECT) o que opera, inclusive partidas ocultas/não-liberadas e torneios
   privados. **[gate]**
7. Convite de equipe e busca de usuário **não viram oráculo** nem vazam PII.

## 2. Modelo de dados

```sql
create table public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.users(id)       on delete cascade,
  papel         text not null check (papel in ('admin','arbitro','moderador')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id) on delete set null,
  primary key (tournament_id, user_id)
);
create table public.league_members ( -- idem, competition_id → league_competitions
  competition_id uuid not null references public.league_competitions(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  papel          text not null check (papel in ('admin','arbitro','moderador')),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.users(id) on delete set null,
  primary key (competition_id, user_id)
);
create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('tournament','league')),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  competition_id uuid references public.league_competitions(id) on delete cascade,
  papel text not null check (papel in ('arbitro','moderador')), -- admin NÃO tem link [re-gate]
  code text not null unique,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ( (escopo='tournament' and tournament_id is not null and competition_id is null)
       or (escopo='league'     and competition_id is not null and tournament_id is null) )
);
create unique index member_invites_torneio_papel on public.member_invites (tournament_id, papel) where tournament_id is not null;
create unique index member_invites_liga_papel    on public.member_invites (competition_id, papel) where competition_id is not null;
```

- **Um papel por pessoa por campeonato** (PK). O **dono não é membro** → anti-lockout.
- `papel` text CHECK (estilo do repo). Vocabulário de papéis é repetido em 3 tabelas + 6
  helpers → **teste de paridade** (§ Testes) para pegar typo de literal. **[gate-nit]**
- **`member_invites.papel` é imutável** **[gate]**: regenerar é DELETE+INSERT; o WITH CHECK
  do UPDATE proíbe alterar a coluna `papel` (senão quem reabrir um link já distribuído
  mudaria de papel sem novo gesto).

## 3. Mapa torneio → liga (herança)

```sql
create or replace function public.liga_do_torneio(p_tid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select ls.competition_id
    from public.league_division_seasons lds
    join public.league_seasons ls on ls.id = lds.season_id
   where p_tid in (lds.tournament_id, lds.tournament_id_clausura, lds.final_tournament_id)
  union
  select ls.competition_id
    from public.league_boundaries lb
    join public.league_seasons ls on ls.id = lb.season_id
   where lb.playoff_tournament_id = p_tid   -- sentinela de playoff E barragem
  limit 1;
$$;
```
Cobre apertura/clausura/final/playoff/barragem (confirmado no schema). `search_path=''`,
tudo qualificado `public.` (estilo dos triggers do repo).

## 4. Helpers de capacidade (RLS)

Três capacidades por escopo. Todos DEFINER/STABLE, `search_path=''`, **revoke PUBLIC;
grant anon, authenticated** (EXECUTE no `schema.sql`, **não** em `local-grants.sql` — este
não concede EXECUTE de funções) **[gate]**.

- `pode_gerir_torneio(p_tid)` = dono direto OR `tournament_members.papel='admin'` OR
  (via `liga_do_torneio`) dono/admin da liga.
- `pode_arbitrar_torneio(p_tid)` = idem com papel ∈ `('admin','arbitro')`.
- `pode_moderar_torneio(p_tid)` = idem com papel ∈ `('admin','moderador')`.
- **`pode_ver_bastidores_torneio(p_tid)`** = dono OR **qualquer** membro (qualquer papel) OR
  (via liga) dono/qualquer `league_member`. **[re-gate HIGH#1]** — a **visibilidade**
  (SELECT) acompanha QUALQUER capacidade (incl. moderador puro), não só arbitrar; é o que o
  invariante 6 promete. Equivale a `pode_gerir OR pode_arbitrar OR pode_moderar`.
- `pode_gerir/arbitrar/moderar_competition(p_cid)` = dono + `league_members` direto.
  `pode_ver_bastidores_competition(p_cid)` = dono OR qualquer `league_member`.

Dono e admin têm as 3 capacidades de ação. (Detalhe: confirmar-fluxo/montar-próxima e
promover-admin são **dono-only** mesmo sendo "gerir" — tratados no app-layer/RPC, §7/§8,
não numa 4ª capacidade.)

## 5. Triggers (defesa em profundidade)

### 5.1 `lock_match_lifecycle` — refatorado **[gate must_fix #1]**
O trigger existente (schema.sql:532) hard-coda `t.created_by = auth.uid()` para QUALQUER
mudança de `status` de partida — barraria o árbitro. Troca-se por
`public.pode_arbitrar_torneio(new.tournament_id)`. A defesa de **coluna** (placar/clube/
W.O. imutáveis em partida encerrada) e o bypass `service_role` permanecem idênticos.

### 5.2 `lock_tournament_reopen` — novo, cobre reabrir E rebaixar **[gate must_fix #2,#6]**
```sql
create or replace function public.lock_tournament_reopen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role'
    then return new; end if;
  if old.status is distinct from new.status
     and ( old.status = 'encerrado'                              -- reabrir
        or (old.status = 'ativo' and new.status = 'rascunho') )  -- rebaixar (crash-recovery)
     and old.created_by is distinct from (select auth.uid()) then
    raise exception 'REVERTER_STATUS_SOMENTE_DONO';
  end if;
  return new;
end; $$;
-- BEFORE UPDATE OF status ON public.tournaments
```
Padrão de `service_role` alinhado aos locks do repo **[gate must_fix #6]**. Convive com
`lock_division_tournament_reopen` (freeze de season) e `lock_match_lifecycle`. O
crash-recovery `ativo→rascunho` legítimo (tournaments.ts:1086) permanece **dono-only** (o
trecho mantém `.eq('created_by')`); admin inicia torneios normais (rascunho→ativo, não
barrado), só não recupera o estado raro de crash — coerente com "reiniciar = dono".

## 6. Refactor de RLS (policies)

| Tabela / policy | Antes | Depois |
|---|---|---|
| `tournaments_select_visivel` | público OR dono OR `eh_participante` | **+ OR `pode_ver_bastidores_torneio(id)`** (qualquer membro vê privado) **[re-gate H#1]** |
| `tournaments_update_owner` | `created_by` | `pode_gerir_torneio(id)` |
| `tournaments_delete_owner` | `created_by` | **inalterada (dono-only)** |
| `matches_select_visivel` | dono vê tudo; demais só liberada | **dono OR `pode_ver_bastidores_torneio` vê tudo (inclusive oculto)** **[re-gate H#1]** |
| `matches_insert_tournament_owner` | dono (subquery) | `pode_gerir_torneio` **[gate #9]** (gerar fase/criar partida = estrutura; preservar TODAS as cláusulas de formato/rodada/participantes/vagas) |
| `matches_update_tournament_owner` | dono | `pode_arbitrar_torneio` |
| `tournament_slots` SELECT | vê quem vê torneio | **+ `pode_ver_bastidores_torneio`** |
| `tournament_slots` **INSERT/DELETE** (criar/remover vaga, rascunho) | dono | `pode_gerir_torneio` **[re-gate H#2]** (geometria = estrutura) |
| `tournament_slots` **UPDATE(owner)** (expulsar/esvaziar técnico) | dono | `pode_moderar_torneio` |
| `participants` **insert-owner-self** (botão "Participar") | self+dono | **inalterada (self/dono)** **[re-gate H#2]** (auto-inscrição, não moderação) |
| `participants` **delete-by-owner** (remover participante) | dono | `pode_moderar_torneio` |
| `tournament_invites_*` | dono | `pode_moderar_torneio` |
| `slot_invites_*` | dono (via vaga) | `pode_moderar_torneio` (via vaga→torneio) |
| `match_wo_requests` UPDATE (veredito) / SELECT-dono | dono | `pode_arbitrar_torneio` |
| `league_*` **INSERT/UPDATE** | `eh_dono_competition` | `pode_gerir_competition` |
| `league_*` **DELETE** (seasons/divisões/competidores/entries/boundaries) | `eh_dono_competition` | **inalterada (dono-only)** **[gate #8]** |
| `league_*` **SELECT** transitivo / `league_competitions` SELECT | ativa OR dono | **+ `pode_ver_bastidores_competition`** (qualquer membro de liga vê) |

Notas **[gate]**:
- **SELECT amplia via `pode_ver_bastidores_*`** (QUALQUER capacidade lê o que opera, incl.
  moderador). A afirmação original "SELECT inalterado" estava errada; ampliar só com
  `pode_arbitrar` (v2) deixava o moderador cego — corrigido no re-gate.
- **Estrutura vs operação**: criar/remover vaga (geometria, rascunho) = **gerir**;
  expulsar técnico / remover participante / convites = **moderar**; auto-inscrição
  ("Participar") = **self/dono**.
- As policies `league_*` transitivas (division_seasons/boundaries via `season→competition`;
  entries com posse + coerência `lc.competition_id=ls.competition_id`) **não são
  find/replace**: troca-se `eh_dono_competition` DENTRO do `exists` mantendo o join; o
  **predicado de coerência cross-pirâmide PERMANECE** (não é posse). **[gate should_fix]**
- Tabelas novas: SELECT de `*_members` = `pode_gerir_*` OR `user_id=auth.uid()`;
  INSERT/UPDATE/DELETE = `pode_gerir_*`; DELETE também por `user_id=auth.uid()` (sair).
  `member_invites` IUD = `pode_gerir_*` (code só legível por gestor); UPDATE não altera
  `papel`. Todas via funções DEFINER (sem subquery reentrante → sem recursão).

## 7. App-layer — mapa action → capacidade

Helper `src/lib/autorizacao.ts`: `podeGerir/podeArbitrar/podeModerar(supabase,
{tournamentId}|{competitionId})` via `.rpc()`. Negação = mensagem única (sem oráculo). Em
caminho quente de mutação, a RLS já é backstop; o helper serve a gates de render RSC e a
mensagens precisas. **[gate nit]**

| Action(s) | Arquivo | Capacidade |
|---|---|---|
| iniciar liga/MM/grupos; avançar fase; gerar MM dos grupos; atualizar cores; **`createMatch` (criar partida); criar/remover vaga (rascunho)** | `tournaments.ts`/`match.ts` | **gerir** **[re-gate]** |
| encerrar torneio | `tournaments.ts` | **gerir** |
| **reabrir torneio**; **crash-recovery ativo→rascunho** | `tournaments.ts` | **dono-only** |
| liberar rodadas | `tournaments.ts` | **arbitrar** |
| `mudarStatusComoDono` (encerrar/reabrir partida); `marcarWoInterno` (marcar/responder W.O.); fechar rodada / varrer órfãos | `match.ts`/`wo.ts` | **arbitrar** **[gate #7]** (varredura **escopada** — NÃO inclui `createMatch`) |
| iniciar divisão; montar playoffs; montar grandes finais; calcular fluxo | `leaguePyramid.ts` | **gerir** (competition) |
| **confirmar fluxo da temporada; montar próxima temporada** | `leaguePyramid.ts` | **dono-only** **[gate #3 + decisão]** |
| gerar/regenerar/remover convite (participante/vaga); **expulsar/esvaziar técnico (slots UPDATE)**; remover participante | slots/invites | **moderar** |
| `participarDoProprioTorneio`; `assumirVagaComoDono`; `updateMatchTeams` (coloca `user_id`/clube = self) | — | **self/dono** (ação pessoal, não delegada) **[gate nit]** |
| gerar/remover convite de equipe; adicionar/remover **árbitro/moderador** | `equipe.ts` | **gerir** |
| adicionar/remover/promover **admin** | `equipe.ts` | **dono-only** **[gate + decisão]** |
| sair da equipe | `equipe.ts` | próprio (`user_id=auth.uid()`) |

**Loaders RSC e filtros transitivos de liga [gate #5]:** `getSeason`/`getCompetition` e os
loaders da pirâmide **deixam de filtrar `created_by`** e passam a gatear por
`pode_gerir_competition` (caso contrário o admin de liga leva `notFound`). Os filtros
transitivos `.eq('...created_by', user.id)` das actions de liga são reescritos. As RPCs
DEFINER `montar_*` trocam o check interno `created_by=auth.uid()` por
`pode_gerir_competition` (exceto `confirmar_fluxo`/`montar_proxima_temporada`, que
**mantêm** `created_by` = dono-only).

## 8. Convite de equipe + aceite

- **Link de convite SÓ para `arbitro`/`moderador`** **[re-gate L]**: `member_invites.papel`
  CHECK in `('arbitro','moderador')`. **Admin não tem link** — só entra por adição direta do
  dono (§9), eliminando a brecha do convite que viraria oráculo de promoção (e o
  `created_by` do convite some no `on delete set null`). Coerente com "promover admin =
  dono-only".
- `gerarConviteMembro(escopo,id,papel)` (gerir): upsert do `member_invites` por
  `(escopo_id,papel)` com `code` único (retry de colisão). Rejeita `papel='admin'`.
- **`info_convite_membro(code)`** DEFINER (EXECUTE authenticated): preview seguro `{escopo,
  id, titulo, papel, ja_membro}` p/ a página de aceite (campeonato pode ser privado; espelha
  `info_convite`).
- **`aceitar_convite_membro(code)`** DEFINER: valida o code, **upsert** em `*_members`
  (papel ∈ árbitro/moderador), **no-op se já dono**, idempotente. Retorna `{escopo,id}`.
  EXECUTE authenticated.
- Rota de aceite `/equipe/convite/[code]` (distinta de `/convite/[code]`).

## 9. Busca de usuário + adição direta

- `buscarUsuarios(query)` (autenticado): `users_public` (id/nome/avatar), **min 2 chars**,
  limit 8, sem PII. Exclui o caller e quem já é membro/dono **[gate nit]** (UX).
- `adicionarMembro(escopo,id,userId,papel)` (gerir; admin exige dono): INSERT em
  `*_members` (idempotente). Notifica (push §10) e a pessoa pode **sair**.
- `removerMembro`/`sairDaEquipe`: **0 linhas afetadas = sucesso idempotente** **[gate]**.
  Remover admin = dono-only.

## 10. UI **[gate should_fix]**

- `page.tsx` do torneio deriva `capacidades = {gerir, arbitrar, moderar}` (uma fonte) e
  mapeia **cada botão** à sua capacidade, **desacoplado de `status`** (hoje uma flag única
  `podeGerirPartidas = ehDono && status!=='encerrado'` conflaciona tudo). Mapeamento
  explícito por componente-filho: `LiberarRodadasButtons`→arbitrar; `VagasSection`/
  `InviteSection`→moderar; `TournamentLifecycleButtons` Encerrar→gerir, **Reabrir→dono**;
  iniciar/avançar/gerar→gerir.
- Subpáginas `/dashboard/torneios/[id]/equipe` e `/dashboard/ligas/[id]/equipe` (gate RSC
  capacidade gerir). **As rotas `/cores` (torneio e liga) deixam de filtrar `created_by`
  no carregamento** e gateiam por capacidade **[gate #5]**.
- Rota de aceite + `AcceptTeamInviteForm` (usa `info_convite_membro`).
- Membro **e** participante coexistem por design (admin é superconjunto; o caminho de
  técnico via `matches_update_participant` segue válido) — documentado. **[gate nit]**

## 11. Push (gatilho de nomeação) **[gate must_fix #4]**

`subscriptions_de`/`eh_co_participante` **não conhecem `*_members`** → o push de nomeação
seria dead code. Cria-se RPC **dedicada** (não toca `eh_co_participante`, para não ampliar
o gate de PII de celular):
```
subscriptions_para_nomeacao(p_user_id uuid, p_escopo text, p_id uuid) → subs
  DEFINER, EXECUTE authenticated; gate (usa o CALLER via (select auth.uid()), mesmo sendo
  DEFINER): pode_gerir_<escopo>(p_id) E p_user_id é membro do escopo — ramifica
  tournament_members (escopo='tournament') vs league_members (escopo='league'). Retorna as
  subs de p_user. Teste negativo: caller que adiciona alguém só p/ ler subs do alvo é
  barrado. **[re-gate NIT]**
```
`adicionarMembro`/`aceitar_convite_membro` inserem o membro e então enviam (best-effort,
não bloqueia). Título "Você virou &lt;papel&gt; em &lt;campeonato&gt;".

## 12. Riscos e mitigações

1. Bypass de reverter status (reabrir/rebaixar) por admin → `lock_tournament_reopen` cobre
   ambos; verificação adversarial.
2. Árbitro barrado pelo `lock_match_lifecycle` → trigger refatorado p/ `pode_arbitrar`.
3. Escrita sobre linha ilegível → SELECT ampliado p/ gestores.
4. Push dead code → RPC dedicada de nomeação.
5. Herança de liga inerte → loaders/filtros de liga reescritos.
6. DELETE em cascata por admin (incl. filhas de liga) → DELETE dono-only em todos os
   níveis; teste.
7. Virar temporada irreversível por admin → dono-only.
8. Admin add por engano com poder total → criar/promover admin é dono-only (raio reduzido a
   árbitro/moderador); risco residual documentado.
9. Convite oráculo / cross-scope → code escopado; RPC valida vínculo; admin exige dono.
10. Busca vaza PII → só `users_public`.
11. Recursão de RLS → helpers DEFINER, sem subquery reentrante.
12. EXECUTE revogado → grants no schema.sql; `local-grants.sql` intocado.

## 13. Decisões de produto (dono 2026-06-21 — não reverter sem perguntar)

- 3 perfis: admin (gerir+arbitrar+moderar), arbitro (arbitrar), moderador (moderar).
- Escopo torneios E ligas, com herança liga→torneios das divisões.
- Convite por link **só para árbitro/moderador**; **admin só por adição direta do dono**
  (busca). Adição direta + push + direito de sair.
- Gestão: dono+admins gerem **árbitro/moderador**; **criar/promover/remover admin =
  dono-only**.
- **Visibilidade segue qualquer capacidade** (`pode_ver_bastidores_*`): moderador também
  lê o campeonato privado que modera.
- **Estrutura de vagas (criar/remover) = gerir**; expulsar/convidar/remover gente =
  moderar; "Participar" = self.
- Dono-only: apagar (todos os níveis), reabrir, rebaixar, **virar temporada** (confirmar
  fluxo + montar próxima), promover admin.
- Reabrir a grande final decorativa também é dono-only (coerente; admin de liga não a
  reabre). **[gate nit — resolvido]**

## 14. Não-objetivos (YAGNI)

- Permissões granulares por-action; badges públicos de papel; auditoria além de
  created_at/by; rate-limit (2ª auditoria); convite com expiração/single-use.
