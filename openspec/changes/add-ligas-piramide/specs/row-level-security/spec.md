# row-level-security — Delta Spec

## ADDED Requirements

### Requirement: RLS das tabelas da pirâmide de ligas

As seis tabelas da pirâmide SHALL ter Row Level Security ativada seguindo o padrão de cascata do schema. SELECT de `league_competitions` SHALL ser visível quando a pirâmide está ativa OU o solicitante é o dono (espelhando a visibilidade pública/dono dos torneios; `is_public` da pirâmide é herdado pelos torneios das divisões na montagem). SELECT das subtabelas (`league_seasons`, `league_division_seasons`, `league_boundaries`, `league_competitors`, `league_division_entries`) SHALL espelhar a visibilidade da pirâmide via subquery transitiva (entry → divisão → temporada → pirâmide). INSERT/UPDATE/DELETE de todas as seis tabelas SHALL ser restrito ao dono da pirâmide (`league_competitions.created_by = auth.uid()`), validado via subquery contra a pirâmide (e via helper `eh_dono_competition` security definer para evitar recursão).

A criação dos torneios e vagas das divisões NÃO SHALL passar por policy de cliente: ela ocorre por uma RPC `SECURITY DEFINER` `montar_temporada(p_season_id uuid)`. As policies existentes `tournaments_insert_owner` e `slots_insert_owner_rascunho` SHALL permanecer INTACTAS e NÃO relaxadas — em particular `slots_insert_owner_rascunho` continua exigindo `user_id is null`, preservando o invariante "técnico só por aceite" do torneio AVULSO. A RPC `montar_temporada` SHALL: (1) validar que `auth.uid()` é o `created_by` da pirâmide dona da temporada (senão levanta exceção); (2) criar os `tournaments` das divisões (`formato='liga'`, `is_public` herdado) e gravar `tournament_id`; (3) inserir os `tournament_slots` JÁ preenchidos, pré-preenchendo `user_id` com o `holder_user_id` do competidor (técnico que acompanha) por DENTRO do definer — o único caminho autorizado a fazê-lo, e só para divisões de pirâmide cujo dono é o caller; (4) quando dois competidores da mesma divisão compartilham o mesmo `holder_user_id` (colisão com o UNIQUE `slots_um_clube_por_tecnico`), gravar `user_id = NULL` na vaga em conflito (vaga gerida pelo dono) em vez de falhar. A RPC NÃO afrouxa nenhuma policy: ela é definer, valida a posse explicitamente e é a única origem de slots com `user_id` pré-preenchido.

Triggers de lock security definer (com bypass de `service_role`) SHALL congelar a temporada encerrada (`lock_league_season`), travar geometria da divisão fora de rascunho (`lock_league_division_season`), travar a identidade do competidor após a primeira partida mantendo `holder_user_id` mutável (`lock_league_competitor_identity`) e — defesa em profundidade do FREEZE — barrar a reabertura do torneio de uma divisão de temporada congelada (`lock_division_tournament_reopen`, na tabela `tournaments`). Este último é necessário porque `reabrirTorneio` opera direto em `tournaments` (o dono da pirâmide é o `created_by` do torneio da divisão e passaria por todas as policies); o trigger SHALL barrar a transição de `status` `'encerrado'` → `'ativo'`/`'rascunho'` quando o torneio pertence a uma divisão cuja `league_seasons.status in ('em_fluxo','encerrada')`. Uma guarda complementar na action `reabrirTorneio` SHALL rejeitar o mesmo caso como camada de UX. Os triggers SHALL ainda estender `lock_slot_relations` para barrar mudança de `competitor_id` fora de rascunho.

#### Scenario: Visitante vê pirâmide ativa, não a arquivada de terceiro

- **WHEN** um visitante (ou usuário não-dono) consulta as pirâmides
- **THEN** enxerga as ativas e as próprias arquivadas, mas não as arquivadas de outros donos

#### Scenario: Só o dono escreve na pirâmide

- **WHEN** um usuário que não é o dono tenta inserir uma temporada, divisão, fronteira, competidor ou entry na pirâmide alheia
- **THEN** a policy de escrita rejeita pela falta de posse, mesmo via POST direto

#### Scenario: Montagem da temporada pré-preenche slots sem furar o invariante do avulso

- **WHEN** o dono monta uma temporada via `montar_temporada` e uma divisão por clube tem competidores com técnico que acompanha
- **THEN** a RPC valida a posse, cria os torneios das divisões e insere os slots com `user_id` pré-preenchido pelo `holder_user_id`, enquanto a policy `slots_insert_owner_rascunho` (que exige `user_id is null`) permanece intacta para o INSERT de cliente de torneios avulsos

#### Scenario: Não-dono não consegue montar temporada alheia

- **WHEN** um usuário que não é o dono da pirâmide chama `montar_temporada` para uma temporada alheia
- **THEN** a RPC levanta exceção de posse e nenhum torneio ou slot é criado, apesar de ela ser SECURITY DEFINER

#### Scenario: Colisão de técnico degrada para vaga gerida pelo dono

- **WHEN** dois competidores da mesma divisão por clube têm o mesmo `holder_user_id` e a temporada é montada
- **THEN** o primeiro slot recebe `user_id = holder_user_id` e o segundo recebe `user_id = NULL` (vaga gerida pelo dono), respeitando o UNIQUE `slots_um_clube_por_tecnico` sem falhar a montagem

#### Scenario: Temporada encerrada congelada pelo lock

- **WHEN** alguém tenta reabrir ou alterar uma temporada com status `encerrada`
- **THEN** o trigger `lock_league_season` levanta exceção (exceto `service_role`), preservando o congelamento

#### Scenario: Reabrir divisão de temporada congelada é barrado no torneio

- **WHEN** o dono da pirâmide chama `reabrirTorneio` sobre o torneio de uma divisão cuja temporada está em `em_fluxo` ou `encerrada`
- **THEN** o guard da action recusa e, mesmo por POST direto, o trigger `lock_division_tournament_reopen` barra a transição de `status` `'encerrado'` → `'ativo'`/`'rascunho'` (exceto `service_role`), mantendo o freeze

#### Scenario: Identidade do competidor imutável após jogar

- **WHEN** o clube ou rótulo de um competidor que já possui entrada de divisão é alterado
- **THEN** o trigger `lock_league_competitor_identity` barra a mudança, mantendo o técnico (`holder_user_id`) ainda substituível
