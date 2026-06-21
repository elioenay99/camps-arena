# Proposal — add-equipe-campeonato

## Why

Hoje a propriedade de um campeonato é **binária**: `created_by = auth.uid()` é o dono
único — checado em ~11 policies RLS e ~16 server actions — e todo o resto é
participante/técnico. O dono de um torneio ou de uma pirâmide de ligas não tem como
**delegar** a operação do dia-a-dia (lançar placares, gerir vagas, montar fases) a outras
pessoas. Em campeonatos reais isso é organização de uma pessoa só.

O dono pediu (2026-06-21): poder **adicionar mais administradores** que façam tudo
**menos apagar ou reabrir/reiniciar** o campeonato, e que eu propusesse **mais perfis de
ajuda**. Decisões de produto batidas com o dono via AskUserQuestion: **3 perfis**
(Administrador, Árbitro/Mesário, Moderador/Recrutador), **escopo torneios E
ligas/pirâmides**, **convite por link E por busca de nome**, **gestão da equipe pelo dono
E pelos administradores** (nunca removendo o dono nem a si mesmos).

## What Changes

Introduz o conceito de **equipe do campeonato**: além do dono, um conjunto de membros com
um **papel** que concede um subconjunto das capacidades do dono. Aplica-se a **torneios**
(`tournaments`) e **ligas/pirâmides** (`league_competitions`), com os membros da liga
**herdando** poder sobre os torneios das divisões.

### Perfis (papéis)

| Papel | Capacidade | Pode | Não pode |
|---|---|---|---|
| **dono** (existente, `created_by`) | — | tudo | — |
| **admin** | gerir + arbitrar + moderar | todo o dia-a-dia do dono | **apagar** e **reabrir/reiniciar** o campeonato |
| **arbitro** | arbitrar | placar, W.O., fechar/liberar rodadas | estrutura, convites, config |
| **moderador** | moderar | convites, vagas, participantes | placar, estrutura |

Três **capacidades** ortogonais derivam o que cada papel faz:
- **gerir** (dono | admin): ciclo de vida e estrutura — iniciar/avançar fases, montar
  playoffs/finais/temporadas, encerrar torneio, cores, gestão da equipe.
- **arbitrar** (dono | admin | árbitro): operação de jogos — lançar/corrigir placar,
  reabrir **partida**, marcar W.O., fechar e liberar rodadas.
- **moderar** (dono | admin | moderador): pessoas — gerar/gerir convites de
  participante/vaga, preencher/expulsar vagas, remover participantes.

**Dono-only** (nem admin) — garantido em policy/trigger, não só no app-layer:
- **apagar** o campeonato e suas tabelas-filhas de liga (DELETE em todos os níveis);
- **reabrir** (`status` `encerrado`→aberto) e **rebaixar** (`ativo`→`rascunho`) o torneio;
- **virar a temporada** da liga (confirmar sobe/cai + montar próxima temporada — é
  irreversível por ninguém);
- **criar/promover/remover admin** (admins gerem apenas árbitros/moderadores).

(Decisões adicionais batidas com o dono 2026-06-21, após o gate apontar o raio de dano.)

### DDL (via MCP mostrando o SQL; espelhada em `schema.sql` + `local-grants.sql` + `database.types.ts`)

- **Tabelas** `tournament_members` e `league_members` (`(escopo_id, user_id)` PK, `papel`
  text CHECK in `('admin','arbitro','moderador')`, `created_at`, `created_by`, FKs CASCADE).
- **Tabela** `member_invites` (link de convite por **papel**): `id`, `escopo`
  (`tournament`|`league`), `tournament_id`/`competition_id` (XOR), `papel`, `code` unique,
  `created_by`, `created_at`. Unique parcial por `(escopo_id, papel)` (um link ativo por
  papel por campeonato, regenerável). Espelha `tournament_invites`.
- **Helper** `liga_do_torneio(uuid) → uuid` (DEFINER, STABLE): mapeia um torneio à sua
  pirâmide-mãe varrendo TODAS as colunas `tournament_id*` de `league_division_seasons`
  (apertura/clausura/final) e `league_boundaries` (playoff/barragem). É como os membros da
  liga herdam poder sobre os torneios das divisões.
- **Helpers de capacidade** (DEFINER, STABLE, grants anon+authenticated — NÃO revogar):
  `pode_gerir_torneio`, `pode_arbitrar_torneio`, `pode_moderar_torneio` (e os análogos
  `*_competition`). Cada um considera dono direto + papel direto + herança da liga.
- **RPC** `aceitar_convite_membro(text)` (DEFINER, espelha `aceitar_convite`): valida o
  code e faz upsert do papel em `*_members`; retorna escopo+id para redirect.
- **Triggers**: `lock_tournament_reopen` (novo, na `tournaments`, DEFINER, bypass
  service_role no padrão `request.jwt.claims` do repo) barra reabrir **e** rebaixar status
  por não-dono; **`lock_match_lifecycle` é refatorado** — troca o `created_by` hard-coded
  por `pode_arbitrar_torneio`, senão o árbitro seria barrado pelo banco ao mexer no placar.
- **Refactor de RLS**: as policies de escrita (`tournaments` UPDATE, `matches`,
  `tournament_slots`, `participants`, `tournament_invites`, `slot_invites`,
  `match_wo_requests`, `league_*` INSERT/UPDATE) trocam `created_by = auth.uid()` pela
  capacidade correspondente. **SELECT amplia** (gestor passa a ler o que opera, inclusive
  torneio privado e partidas ocultas). **DELETE permanece dono-only em TODOS os níveis**
  (`tournaments`, `league_competitions` e as filhas de liga). Helpers existentes
  (`eh_participante`, `eh_dono_competition`, …) **intocados**.

### App-layer (autorização)

- Novo `src/lib/autorizacao.ts`: `podeGerir/podeArbitrar/podeModerar(supabase,
  {tournamentId|competitionId})` — chama a função de capacidade via `.rpc()` (fonte única
  no banco). Mensagem de negação única (sem oráculo), igual ao padrão atual.
- As ~16 actions trocam o filtro `eq('created_by', user.id)` (ou o join transitivo das
  ligas) pela capacidade certa: **gerir** (estrutura/ciclo), **arbitrar** (placar/W.O./
  rodadas), **moderar** (convites/vagas/participantes). **Reabrir torneio** continua
  dono-only.
- Gestão da equipe: `gerarConviteMembro` / `removerConviteMembro` / `aceitarConviteMembro`
  / `adicionarMembro` (busca) / `removerMembro` / `sairDaEquipe` (capacidade **gerir**;
  **criar/remover/promover admin = dono-only**; sair = próprio; remover idempotente).
  `info_convite_membro` (preview seguro do convite, campeonato pode ser privado).
  `buscarUsuarios(query)` (autenticado, só nome+avatar+id via `users_public`; mínimo de
  caracteres; exclui caller/membros; sem PII).

### UI

- Subpágina `/dashboard/torneios/[id]/equipe` (e a análoga da pirâmide), no padrão de
  `/cores`: lista de membros com papel + remover; gerar/copiar/regenerar link por papel;
  buscar pessoa por nome e adicionar. Visível a quem **pode gerir**.
- Página de aceite de convite de equipe (rota nova, distinta de `/convite/[code]`).
- Os consoles existentes (`Administração do torneio`, `VagasSection`, `InviteSection`,
  `LiberarRodadasButtons`, lifecycle) passam a aparecer conforme a **capacidade** do
  usuário, não só `ehDono`.

### Push (gatilho novo)

- Ao ser nomeado/aceitar um papel, o membro recebe uma notificação ("Você virou
  &lt;papel&gt; em &lt;campeonato&gt;"), best-effort. Como `eh_co_participante` não conhece
  `*_members`, o envio usa uma RPC **dedicada** `subscriptions_para_nomeacao` (gated:
  caller pode_gerir + alvo é membro) em vez de `subscriptions_de`.

## Capabilities

- **Nova**: `competition-roles` (perfis/equipe, capacidades, convites de membro, gestão,
  busca de usuário).
- **Modificada**: `data-model` (3 tabelas), `row-level-security` (helpers de capacidade,
  policies refatoradas, trigger de reabertura, herança liga→torneio),
  `tournament-lifecycle` (reabrir = dono-only formalizado), `push-notifications` (gatilho
  de nomeação).

## Impact

- **Novo no banco**: 3 tabelas, ~7 funções (1 mapa + 6 capacidades), 1 RPC de aceite, 1
  trigger; ~8 policies novas (das tabelas novas). DDL ao PROD via MCP mostrando o SQL.
- **Editado no banco**: ~11 policies de torneio + análogas de liga trocam dono→capacidade.
- **Novo no código**: `src/lib/autorizacao.ts`, `src/actions/equipe.ts`,
  `src/features/team-roles/*` (UI), rota de equipe + rota de aceite, gatilho de push.
- **Editado no código**: ~16 actions (autorização), página do torneio/pirâmide
  (renderização por capacidade), `database.types.ts`, `schema.sql`, `local-grants.sql`.
- **Sem regressão**: campeonatos sem equipe seguem idênticos (dono é o único membro
  efetivo); a herança da liga só adiciona poder a quem o dono nomear; reabrir/apagar
  continuam dono-only com defesa em profundidade.
- **Risco**: ALTO. É refactor de autorização transversal. Pontos de atenção no
  `design.md`: cobertura COMPLETA do mapa torneio→liga (apertura/clausura/final/playoff/
  barragem); NÃO revogar EXECUTE dos helpers (lição registrada); trigger de reabertura
  fechando o bypass do admin; DELETE permanecer dono-only; convite de equipe não virar
  oráculo; busca de usuário não vazar PII; idempotência/anti-lockout da gestão.
