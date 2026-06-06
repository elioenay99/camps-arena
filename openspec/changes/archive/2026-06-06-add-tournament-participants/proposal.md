# Proposal: add-tournament-participants

## Why

Hoje o dono do torneio escala QUALQUER usuário do app numa partida — sem
consentimento (a atribuição concede UPDATE de placar via RLS) — e o participante
convidado num torneio privado de terceiro não consegue sequer descobrir o
torneio/partidas no dashboard (limitações registradas em
`add-match-creation`). Além disso, a lista de participantes por torneio é
pré-requisito real dos formatos de torneio pedidos pelo usuário (gerar
tabela/chaves de liga, grupos e mata-mata).

Decisões de produto do usuário (2026-06-05): convite por **link/código** gerado
pelo dono; **aceite obrigatório** (entrar exige ação explícita do convidado);
participante pode **sair** e o dono pode **remover** (partidas já criadas ficam
como histórico); criação de partida passa a ser **restrita aos participantes**
do torneio.

## What Changes

- Nova tabela `participants` (linha = participante confirmado; sem estado
  pendente — o aceite É a ação de entrar pelo link) e nova tabela
  `tournament_invites` (1:1 com torneio, código secreto; tabela separada porque
  a RLS de SELECT público de `tournaments` vazaria o código).
- Aceite via função `SECURITY DEFINER` `aceitar_convite(codigo)` (valida código
  + torneio não-encerrado + insere com `auth.uid()`) e `info_convite(codigo)`
  para a página pública do convite exibir o torneio antes do aceite.
- Rota pública `/convite/[codigo]`: não logado → CTA entrar/criar conta com
  `redirectTo` seguro de volta; logado → "Entrar no torneio".
- Página do torneio ganha gestão de participantes: link de convite copiável +
  regenerar (dono), lista de participantes com remover (dono) e sair (próprio).
- Dono vira participante automaticamente ao criar torneio (pode sair).
- Visibilidade: participante passa a VER o torneio (e partidas) mesmo privado —
  RLS de `tournaments` ganha cláusula de participante via função
  `eh_participante()` `SECURITY DEFINER` (evita recursão de policy); dashboard
  passa a mostrar essas partidas sem mudança de query.
- **BREAKING (comportamento)**: criação de partida restrita aos participantes —
  selects listam só participantes do torneio (antes: todos os usuários do app);
  validação na action + policy de INSERT de `matches` atualizada.
- Form de nova partida muda para `/dashboard/torneios/[id]/partidas/nova`;
  `/dashboard/partidas/nova` vira seletor de torneio.
- Nova página índice `/dashboard/torneios` (Organizo / Participo) + link no nav
  — participante que aceitou convite precisa de um lugar para achar o torneio.
- DDL manual: seção 8 em `docs/pendencias-manuais.md` (tabelas, funções,
  policies novas e atualizadas).

## Capabilities

### New Capabilities

- `tournament-participants`: ciclo de vida do participante — convite por
  link/código (gerar, regenerar, segredo), aceite explícito, sair, remover,
  entrada automática do dono, página de convite e gestão na página do torneio.
- `tournament-index`: página `/dashboard/torneios` listando torneios que o
  usuário organiza e dos quais participa, com entrada no nav.

### Modified Capabilities

- `match-creation`: participantes selecionáveis/validáveis passam a ser SÓ os
  participantes do torneio; form movido para rota aninhada no torneio; rota
  antiga vira seletor.
- `row-level-security`: `tournaments`/`matches` visíveis a participantes;
  INSERT de `matches` exige participantes ∈ `participants`; policies das novas
  tabelas; funções `SECURITY DEFINER`.
- `data-model`: tabelas `participants` e `tournament_invites`, funções
  `eh_participante`, `aceitar_convite`, `info_convite`.
- `tournament-management`: criação do torneio passa a inserir o dono como
  participante e gerar o código de convite.

(As seções novas da página do torneio — convite, participantes, botão "Nova
partida" — são especificadas dentro de `tournament-participants` e
`match-creation`; `standings-page` não muda de requisito.)

## Impact

- Banco (DDL manual, seção 8 das pendências): 2 tabelas novas, 3 funções, RLS
  nova (`participants`, `tournament_invites`) e atualizada
  (`tournaments_select_visivel`, `matches_select_visivel`,
  `matches_insert_tournament_owner`). Sem a seção 8 aplicada, criar torneio e a
  página do torneio FALHAM (consultas a tabelas inexistentes).
- Código: `src/actions/participants.ts` (novo), `tournaments.ts` (dono entra +
  invite), `match.ts` (`createMatch` valida participação),
  `src/lib/invite-code.ts` (novo), fetchers de tournament/participants, rotas
  `/convite/[codigo]`, `/dashboard/torneios` (índice),
  `/dashboard/torneios/[id]/partidas/nova`, nav, página do torneio.
- Compatibilidade: partidas/dados legados intactos (a restrição vale para
  INSERTs novos); torneios legados sem invite → dono regenera na UI.
