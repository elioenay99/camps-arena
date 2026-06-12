# Design — add-competidores-por-nome

Sintetizado de um mapeamento exaustivo dos consumidores de `tournament_slots`/clube
(workflow 4 áreas) + verificação direta do código. Honra a classe de bug
"consumidor órfão" ([[arena-modelo-clube-centrico]]).

## DDL (aplicada via MCP; fonte de verdade = `supabase/schema.sql`)

```sql
-- tournament_slots: vaga passa a aceitar NOME livre (sem clube)
alter table public.tournament_slots alter column team_id drop not null;
alter table public.tournament_slots add column if not exists rotulo text;

alter table public.tournament_slots drop constraint if exists slots_clube_xor_rotulo;
alter table public.tournament_slots add constraint slots_clube_xor_rotulo
  check ((team_id is null) <> (rotulo is null));      -- ou clube OU nome
alter table public.tournament_slots drop constraint if exists slots_rotulo_nao_vazio;
alter table public.tournament_slots add constraint slots_rotulo_nao_vazio
  check (rotulo is null or length(trim(rotulo)) > 0);

-- UNIQUE inline (tournament_id, team_id) → índices parciais
alter table public.tournament_slots drop constraint if exists slots_team_unico_no_torneio;
create unique index if not exists slots_team_unico_no_torneio
  on public.tournament_slots (tournament_id, team_id) where team_id is not null;
create unique index if not exists slots_rotulo_unico_no_torneio
  on public.tournament_slots (tournament_id, lower(trim(rotulo))) where rotulo is not null;

-- flag do torneio
alter table public.tournaments add column if not exists por_nome boolean not null default false;
```

Trigger `lock_slot_relations`: adicionar trava simétrica de `rotulo` (imutável pós-rascunho),
espelhando a de `team_id`. RPC `info_convite_vaga`: `left join teams` + `coalesce(tm.nome, ts.rotulo)`
para `clube`, `tm.escudo_url` p/ escudo (defensivo — vaga por nome nunca tem `slot_invite`).

**Sem backfill**: todo slot legado tem `team_id` (NOT NULL hoje) → `slots_clube_xor_rotulo`
passa (team_id not null, rotulo null). Pré-check: 0 slots com `team_id is null`.

`matches` NÃO muda: `vaga_1/vaga_2` são ids opacos; CHECKs e índices de geração intactos.
RLS de slots: nenhuma policy lê `team_id` (filtram por tournament/created_by/user_id);
`slots_insert_owner_rascunho` exige `user_id is null` (vaga por nome respeita). Sem policy nova.

## Verificações que SIMPLIFICAM o escopo
- **W.O. automático seguro** (`closeRound.ts:66`): `varrerOrfaosDaRodada` só resolve
  quando EXATAMENTE um lado é órfão (XOR `orfao1 !== orfao2`). Em torneio por nome
  TODAS as vagas têm `user_id` NULL → toda partida é órfão×órfão → `resolvivel` falso
  → nada é varrido. `wo.ts`/`closeRound.ts` **não mudam**.
- **TeamCrest já cai para iniciais** (`TeamCrest.tsx`) com qualquer `nome` quando
  `escudoUrl` é falsy → zero componente novo. `StandingsTable`/`BracketView` herdam.
- **RLS de placar**: autorização por `user_id` (técnico/dono), ortogonal a team/rotulo.
  Dono lança tudo = comportamento atual.

## Criação (toggle + nomes)
- `tournamentSchema.ts`: `porNome: z.boolean().default(false)`; `nomes: z.array(z.string().trim().min(1).max(40))`;
  refine — se `porNome`: exige 2..teto NOMES, `clubes` vazio, sem duplicata case-insensitive;
  senão regra atual de `clubes`. Tetos por formato contam VAGAS (`porNome ? nomes : clubes`).
- `createTournament`: persiste `por_nome`; modo nome insere `{tournament_id, rotulo}` e
  PULA `slot_invites`; modo clube inalterado. Normaliza server-side (zera o lado oposto).
- `TournamentForm`: toggle (formatos competitivos) → troca `TeamSearchInput` por um
  input de texto + lista de chips removíveis (sem API). Hidden `porNome` + `nomes[]`.

## Exibição (fallback nome)
`getVagasDoTorneio` / `getActiveMatches` / `getTournamentClassificacao` / `getSolicitacoesWO`:
adicionar `rotulo` ao embed do slot; `nome = team?.nome ?? rotulo`; `escudoUrl = team?.escudo_url ?? null`.
`VagaDoTorneio.porNome = !team` → `VagasSection` esconde técnico ("téc."/"vaga aberta") e o
console de convite/regenerar/expulsar no modo nome. `MatchCard.ladoVaga` idem.

## Edge cases
- Bye (vaga_X null na partida) ≠ vaga por nome (slot existe, team_id null + rotulo): o guard é
  `vaga === null` (partida) vs `team == null && rotulo != null` (slot). Fetchers checam `team` antes do rótulo.
- Encerrar/reabrir: trava de `rotulo` no `lock_slot_relations` (DDL). Reabrir não toca vagas.
- `database.types.ts`: regenerar (`team_id: string|null`, `rotulo: string|null`, `tournaments.por_nome: boolean`).

## Arquivos (lista completa em proposal.md §Impact). Testes por fetcher com fixture `team null + rotulo`.
