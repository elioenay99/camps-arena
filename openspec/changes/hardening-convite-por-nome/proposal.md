# Proposal — hardening-convite-por-nome

## Why

A feature "competidores por NOME" ([[projeto-competidores-por-nome]]) estabeleceu
que uma vaga por NOME (`tournament_slots.team_id IS NULL` + `rotulo`) **não tem
técnico nem convite** — o organizador lança os placares. O próprio schema já
DOCUMENTA o invariante: `info_convite_vaga` comenta "vaga por nome nunca gera
slot_invite" (supabase/schema.sql:928).

Mas hoje esse invariante só é garantido pela **UI** (a `VagasSection` esconde o
botão de convite em vaga por-nome). No banco, nada barra a criação de um
`slot_invite` para uma vaga por-nome:

- `regenerarConviteVaga` (src/actions/slots.ts) confere só a PROPRIEDADE (dono do
  torneio) e faz `upsert` em `slot_invites` para QUALQUER vaga do dono — inclusive
  por-nome.
- As policies `slot_invites_insert_owner`/`_update_owner` gateiam por propriedade,
  sem excluir vaga por-nome.

Um dono que faça POST direto a `regenerarConviteVaga` com o id de uma vaga
por-nome criaria um `slot_invite` órfão; em tese, alguém poderia então `aceitar`
esse convite e atribuir um "técnico" a uma vaga que não deveria ter dono. **Impacto
hoje é nulo** (a UI nunca expõe o caminho), mas é um furo de defesa-em-profundidade
no exato ponto que o modelo proíbe. É o último loose end da feature por-nome.

## What Changes

Fecha o furo em TRÊS camadas (idioma de "segurança em profundidade" do projeto —
RLS + trigger + checagem na Server Action), sem mudar nenhum comportamento de
vaga de CLUBE:

- **Trigger de integridade** (`block_slot_invite_por_nome`, BEFORE INSERT OR
  UPDATE em `slot_invites`): levanta exceção se a vaga referenciada é por-nome
  (`team_id IS NULL`). Universal (vale inclusive para `service_role`) — é o
  invariante de dados que um CHECK não consegue expressar (a condição mora em
  outra tabela).
- **RLS tightening**: `slot_invites_insert_owner` e `_update_owner` ganham
  `and s.team_id is not null` no `with check` — a policy do dono passa a só
  permitir convite de vaga de clube.
- **Guard na Server Action** `regenerarConviteVaga`: lê `team_id` da vaga e
  recusa vaga por-nome com mensagem clara em pt-BR (a UX antes de tocar o banco;
  as camadas de banco são o backstop para bypass direto).

## Capabilities

Nenhuma capability nova. Adiciona um requisito de INTEGRIDADE a `club-slots`
(vaga por nome não tem convite), reforçando o requisito "Convite por vaga"
existente sem alterá-lo para vagas de clube.

## Impact

- **DDL em PROD** (idempotente; aplicada por mim via MCP MOSTRANDO o SQL antes —
  [[feedback-mcp-autonomia]] + REGRA 4). Espelhada em `supabase/schema.sql`:
  - função+trigger `block_slot_invite_por_nome` em `slot_invites`;
  - recriação das policies `slot_invites_insert_owner`/`_update_owner` com a
    exclusão `team_id is not null` no `with check`.
  - SEM backfill: vaga por-nome nunca gerou convite (a verificar com um SELECT
    read-only antes de aplicar). O trigger valida só escritas FUTURAS — seguro
    sobre dados existentes.
- **Código**: `src/actions/slots.ts` — `regenerarConviteVaga` passa a selecionar
  `team_id` e recusar vaga por-nome.
- **Testes**: `src/actions/slots.test.ts` — novo caso (vaga por-nome recusada,
  sem upsert) + os casos existentes de regenerar passam a marcar `team_id`
  (vaga de clube realista).
- **Sem mudança**: `aceitar_convite_vaga` (sem convite por-nome, o RPC nunca a
  alcança), demais actions, motores, UI (a `VagasSection` já esconde o botão),
  `database.types.ts` (trigger/policy não mudam tipos).
- **Risco**: baixo. Pontos de atenção: a DDL não pode afetar vaga de clube
  (convite segue funcionando); confirmar zero `slot_invite` órfão antes; manter
  os testes existentes verdes.
