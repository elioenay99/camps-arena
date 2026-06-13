# Design — hardening-convite-por-nome

## Invariante

Vaga por NOME ⇔ `tournament_slots.team_id IS NULL` (XOR com `rotulo`, garantido
por `slots_clube_xor_rotulo`). Regra: **uma vaga por-nome NUNCA tem linha em
`slot_invites`**. Hoje só a UI garante; vamos enforçar no banco + action.

## Por que trigger (e não CHECK)

`slot_invites` referencia o slot por `slot_id`; a propriedade "é por-nome" mora em
`tournament_slots.team_id`. Um CHECK não cruza tabelas — então é trigger BEFORE
INSERT OR UPDATE (mesmo padrão do `lock_slot_relations`). Universal (sem bypass de
`service_role`): é integridade de dados pura, e não há caminho legítimo
(seed/admin) que crie convite para vaga por-nome — seeds criam vagas de clube.

## DDL (idempotente — a aplicar em prod via MCP, mostrando o SQL antes)

```sql
-- 1) Trigger de integridade: vaga por NOME (team_id NULL) nunca tem slot_invite.
create or replace function public.block_slot_invite_por_nome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.tournament_slots s
    where s.id = new.slot_id
      and s.team_id is null
  ) then
    raise exception 'SLOT_POR_NOME';
  end if;
  return new;
end;
$$;

drop trigger if exists slot_invites_block_por_nome on public.slot_invites;
create trigger slot_invites_block_por_nome
  before insert or update on public.slot_invites
  for each row execute function public.block_slot_invite_por_nome();

-- 2) RLS: a policy do dono passa a excluir vaga por-nome no with check.
drop policy if exists slot_invites_insert_owner on public.slot_invites;
create policy slot_invites_insert_owner on public.slot_invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
        and s.team_id is not null
    )
  );

drop policy if exists slot_invites_update_owner on public.slot_invites;
create policy slot_invites_update_owner on public.slot_invites
  for update to authenticated
  using (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
        and s.team_id is not null
    )
  );
```

Ordem de avaliação no INSERT do dono (authenticated): o BEFORE trigger roda antes
do `with check` da RLS — qualquer das duas barra a vaga por-nome. Para um bypass
via `service_role` (RLS off), o trigger é o backstop.

## Guard na Server Action

`regenerarConviteVaga` já lê a vaga p/ checar propriedade. Estende o select a
`team_id` e, depois de confirmar a vaga, recusa por-nome com mensagem clara —
ANTES de tocar `slot_invites`. As camadas de banco continuam como backstop para
quem chamar o PostgREST direto.

```ts
// select: "id, tournament_id, team_id, tournaments!inner(id)"
if (slot.team_id === null) {
  return { ok: false, error: "Vagas por nome não usam convite." }
}
```

## Não-objetivos

- Não mexer em `aceitar_convite_vaga`: sem convite por-nome, o RPC (que entra por
  `slot_invites.code`) nunca alcança uma vaga por-nome. Adicionar guard lá seria
  redundante com o chokepoint do convite.
- Não tocar UI (a `VagasSection` já esconde convite/técnico em por-nome), nem
  `database.types.ts` (trigger/policy não mudam tipos).
- Sem backfill: nenhum convite por-nome existe (confirmar com SELECT). O trigger
  só valida escritas futuras — aplicar é seguro sobre dados existentes.

## Validação

- Unit: caso novo (vaga por-nome recusada na action, sem upsert) + casos de
  regenerar de clube seguem verdes.
- Banco: após aplicar, confirmar que o trigger e as policies existem (read), e
  que o convite de vaga de CLUBE continua funcionando (a feature por-nome foi
  validada ao vivo; não regredir o caminho de clube).
