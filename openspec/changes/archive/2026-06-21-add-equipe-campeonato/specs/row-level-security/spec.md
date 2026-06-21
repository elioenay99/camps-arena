# row-level-security — Delta Spec

## ADDED Requirements

### Requirement: Helpers de capacidade e mapa de herança

O schema SHALL ter um mapa `liga_do_torneio(uuid) → uuid` (SECURITY DEFINER, STABLE) que
resolve a pirâmide-mãe de um torneio cobrindo TODAS as referências de torneio nas tabelas
de liga: `league_division_seasons.tournament_id`, `.tournament_id_clausura`,
`.final_tournament_id` e `league_boundaries.playoff_tournament_id` (sentinela de playoff e
barragem). O schema SHALL ter seis funções de capacidade SECURITY DEFINER/STABLE —
`pode_gerir_torneio`, `pode_arbitrar_torneio`, `pode_moderar_torneio` e os análogos
`*_competition` — que retornam `true` para o dono e para os papéis correspondentes
(direto e, no caso de torneio, herdado da liga via `liga_do_torneio`). TODAS essas
funções (e o mapa) SHALL manter `EXECUTE` para `anon` e `authenticated` (revogar quebra a
RLS, pois a policy invoca a função com o papel da query).

#### Scenario: Capacidade herdada da liga resolve pelo mapa

- **WHEN** uma policy avalia `pode_gerir_torneio` sobre um torneio de divisão (apertura,
  clausura, final, playoff ou barragem)
- **THEN** o mapa `liga_do_torneio` encontra a pirâmide e o admin/dono da liga é
  autorizado

#### Scenario: EXECUTE preservado evita quebra de RLS

- **WHEN** um usuário authenticated dispara uma policy que chama um helper de capacidade
- **THEN** a função executa (EXECUTE concedido a authenticated) e a policy decide; revogar
  o EXECUTE causaria `permission denied`/recursão e está proibido

### Requirement: Escrita e visibilidade por capacidade; apagar/reverter dono-only

As policies de escrita SHALL autorizar pela **capacidade** adequada
(gerir/arbitrar/moderar) em vez de `created_by = auth.uid()` puro, nas tabelas
`tournaments` (UPDATE), `matches`, `tournament_slots`, `participants`,
`tournament_invites`, `slot_invites`, `match_wo_requests` e nas tabelas `league_*`
(INSERT/UPDATE). A **visibilidade** (SELECT) de `tournaments`, `matches`, vagas,
participantes e convites (e análogos de liga) SHALL ampliar via
`pode_ver_bastidores_*` para que quem tem **qualquer** capacidade (gerir, arbitrar **ou
moderar**) leia o que opera, inclusive torneio privado e partidas ocultas/não-liberadas
(escrever sobre linha ilegível é proibido; ampliar só com `pode_arbitrar` deixaria o
moderador cego). **Criar/remover vaga** (geometria, em rascunho) é capacidade **gerir**
(estrutura); expulsar técnico, remover participante e gerir convites são **moderar**;
auto-inscrição ("Participar") permanece **self/dono**. As policies de **DELETE** de `tournaments`, `league_competitions` e de TODAS as
tabelas-filhas de liga (seasons, divisões, competidores, entries, boundaries) SHALL
permanecer restritas ao dono (`created_by`/`eh_dono_competition`). O trigger
`lock_match_lifecycle` SHALL ser refatorado para autorizar a mudança de status de partida
por `pode_arbitrar_torneio` (não mais `created_by` puro), preservando a defesa de coluna.
Um trigger `lock_tournament_reopen` (SECURITY DEFINER, bypass service_role no padrão
`request.jwt.claims` do repo) SHALL barrar para não-donos tanto a **reabertura**
(`encerrado`→aberto) quanto o **rebaixamento** (`ativo`→`rascunho`). Os locks de freeze da
pirâmide SHALL continuar barrando reabertura de season/divisão congelada.

#### Scenario: Gestor lê e opera torneio privado

- **WHEN** um árbitro convidado de um torneio privado, sem ser participante nem técnico,
  abre o torneio
- **THEN** o SELECT ampliado deixa-o ler o torneio e as partidas (mesmo ocultas) e a
  policy de UPDATE deixa-o registrar placar — leitura e escrita casam

#### Scenario: Moderador puro enxerga o que modera

- **WHEN** um moderador (sem capacidade de arbitrar) de um torneio privado abre o torneio
- **THEN** o SELECT via `pode_ver_bastidores_torneio` deixa-o ler o torneio, as vagas e os
  participantes, e gerir convites/expulsar — mas não lança placar nem cria/remove vaga

#### Scenario: Árbitro muda status de partida via trigger refatorado

- **WHEN** um árbitro encerra/reabre uma partida ou marca W.O. (mudança de status)
- **THEN** o `lock_match_lifecycle` autoriza por `pode_arbitrar_torneio` em vez de barrar
  por não ser o dono

#### Scenario: Admin gere via UPDATE mas não reabre nem rebaixa

- **WHEN** um admin dá UPDATE em `tournaments` (config, status ativo→encerrado)
- **THEN** a policy de capacidade gerir permite
- **AND** se tentar `encerrado`→aberto ou `ativo`→`rascunho`, o trigger
  `lock_tournament_reopen` levanta exceção (só o dono reverte status)

#### Scenario: Apagar é exclusivo do dono em todos os níveis

- **WHEN** um admin tenta DELETE de um torneio, de uma pirâmide ou de uma temporada/
  divisão/competidor (mesmo por POST direto)
- **THEN** a policy de DELETE rejeita por não ser o dono

#### Scenario: Árbitro não gera estrutura

- **WHEN** um árbitro tenta iniciar/avançar fase (INSERT de partidas de fase) por POST
  direto
- **THEN** a operação é negada: `matches_insert` exige capacidade **gerir**, preservadas
  as cláusulas de formato/rodada/participantes/vagas

### Requirement: RLS das tabelas de equipe

`tournament_members`, `league_members` e `member_invites` SHALL ter RLS ativa. SELECT de
membros SHALL ser visível a quem tem capacidade **gerir** do campeonato OU ao próprio
`user_id`. INSERT/UPDATE/DELETE de membros SHALL exigir capacidade **gerir**; DELETE SHALL
também permitir o próprio `user_id` (sair). Todas as operações de `member_invites` SHALL
exigir capacidade **gerir** (o `code` nunca é exposto a não-gestores). As policies dessas
tabelas SHALL usar as funções de capacidade SECURITY DEFINER (sem subquery reentrante na
própria tabela, evitando recursão).

#### Scenario: Só gestor lê a lista de equipe (e a pessoa vê a si)

- **WHEN** um participante comum consulta `tournament_members`
- **THEN** vê no máximo a própria linha; a lista completa só para quem tem capacidade gerir

#### Scenario: Sair é um DELETE da própria linha

- **WHEN** um membro remove a própria linha de `*_members`
- **THEN** a policy permite por `user_id = auth.uid()`, sem exigir capacidade gerir
