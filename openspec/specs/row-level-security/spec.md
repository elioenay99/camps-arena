# row-level-security Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: RLS habilitado nas tabelas
O sistema SHALL habilitar Row Level Security em `users`, `tournaments`, `matches`, `participants` e `tournament_invites`.

#### Scenario: Acesso negado sem política aplicável
- **WHEN** uma operação não coberta por nenhuma política é tentada
- **THEN** o banco rejeita a operação por padrão (deny-by-default)

### Requirement: Leitura pública de partidas
O sistema SHALL permitir SELECT em uma partida quando o torneio dela for visível ao solicitante (público, privado do próprio solicitante, ou privado em que o solicitante é participante via `eh_participante()`) ou quando o solicitante autenticado for participante da partida. Partidas de torneios privados de terceiros NÃO SHALL ser visíveis a quem não participa do torneio nem da partida.

#### Scenario: Visitante lê partidas de torneio público
- **WHEN** um visitante (autenticado ou não) consulta partidas de um torneio público
- **THEN** os dados de placar são retornados

#### Scenario: Participante do torneio vê as partidas do torneio privado
- **WHEN** um participante confirmado do torneio consulta partidas desse torneio privado
- **THEN** as partidas são retornadas (inclusive as que ele não joga)

#### Scenario: Partida de torneio privado oculta de terceiros
- **WHEN** um usuário que não é dono do torneio nem participante consulta uma partida de torneio privado
- **THEN** a política RLS não retorna a partida

#### Scenario: Participante vê a própria partida em torneio privado de terceiro
- **WHEN** um participante autenticado da partida consulta a partida, mesmo sem ser dono do torneio privado
- **THEN** a partida é retornada

### Requirement: Escrita restrita ao dono da partida
Partidas AVULSAS: o participante (participante_1/2 = auth.uid()) ou o dono do torneio SHALL poder atualizar placar/clube como hoje. Partidas COMPETITIVAS: SHALL poder atualizar quem for TÉCNICO de uma das vagas da partida (EXISTS em tournament_slots com user_id = auth.uid()) ou o dono do torneio. Status segue restrito ao dono (trigger). Vaga órfã: só o dono movimenta a partida.

#### Scenario: Técnico lança placar
- **WHEN** o técnico atual de um dos clubes da partida atualiza o placar
- **THEN** a escrita passa (RLS + trigger de lifecycle)

#### Scenario: Ex-técnico não escreve
- **WHEN** quem desistiu/foi expulso tenta atualizar partida do antigo clube
- **THEN** a escrita é negada (não é mais técnico da vaga)

### Requirement: Visibilidade de torneios por dono e público
O sistema SHALL permitir SELECT em um torneio quando ele for público (`is_public`), quando o solicitante autenticado for o dono (`created_by = auth.uid()`) ou quando o solicitante for PARTICIPANTE do torneio (avaliado via função `eh_participante()` `SECURITY DEFINER`, que lê `participants` sem reentrar nas policies — evita recursão). Torneios privados de terceiros sem participação NÃO SHALL ser visíveis.

#### Scenario: Torneio público é visível a todos
- **WHEN** qualquer visitante (autenticado ou não) consulta um torneio público
- **THEN** o torneio é retornado

#### Scenario: Torneio privado visível só ao dono
- **WHEN** um usuário autenticado consulta um torneio privado que ele criou
- **THEN** o torneio é retornado

#### Scenario: Participante vê torneio privado de terceiro
- **WHEN** um participante confirmado consulta um torneio privado criado por outra pessoa
- **THEN** o torneio é retornado

#### Scenario: Torneio privado de terceiro é ocultado
- **WHEN** um usuário que não é dono nem participante consulta um torneio privado de outra pessoa
- **THEN** a política RLS não retorna o torneio

### Requirement: Escrita de torneio restrita ao dono
O sistema SHALL permitir INSERT de torneio apenas quando `created_by` for o próprio usuário autenticado, e UPDATE/DELETE apenas pelo dono do torneio. A posse NÃO SHALL ser transferível via UPDATE.

#### Scenario: Dono cria o próprio torneio
- **WHEN** um usuário autenticado insere um torneio com `created_by` igual ao seu id
- **THEN** a inserção é aceita

#### Scenario: Criar em nome de outro é negado
- **WHEN** um usuário tenta inserir um torneio com `created_by` de outra pessoa
- **THEN** a política RLS rejeita a operação

#### Scenario: Terceiro não edita nem apaga
- **WHEN** um usuário que não é o dono tenta UPDATE ou DELETE no torneio
- **THEN** a política RLS rejeita a operação

### Requirement: Criação de partida restrita ao dono do torneio
INSERT em matches SHALL exigir dono do torneio + não-encerrado. Partidas geradas (rodada não nula) SHALL ter cada VAGA informada pertencente ao torneio (EXISTS em tournament_slots). Avulso mantém a validação por participants.

#### Scenario: Vaga estrangeira recusada
- **WHEN** um INSERT informa vaga_1 de OUTRO torneio
- **THEN** a policy recusa

### Requirement: Políticas de participants
As políticas de participants SHALL valer para o formato AVULSO: SELECT por quem vê o torneio; INSERT dono-para-si; DELETE pelo próprio ou pelo dono SEM cláusula de congelamento por formato (formatos competitivos não usam participants).

#### Scenario: Sair de torneio avulso é livre
- **WHEN** um participante sai de torneio avulso a qualquer momento
- **THEN** o DELETE passa (sem congelamento)

### Requirement: Políticas de tournament_invites
O sistema SHALL restringir TODAS as operações em `tournament_invites` ao dono
do torneio correspondente. O fluxo de aceite NÃO SHALL depender de leitura
direta da tabela pelo convidado (a validação do código ocorre nas funções
`SECURITY DEFINER`).

#### Scenario: Dono gerencia o próprio convite
- **WHEN** o dono consulta/insere/atualiza o invite do seu torneio
- **THEN** a operação é aceita

#### Scenario: Convidado não enumera códigos
- **WHEN** um usuário autenticado que não é dono consulta `tournament_invites`
- **THEN** nenhuma linha é retornada

### Requirement: Funções SECURITY DEFINER de convite
`aceitar_convite`/`info_convite` (genéricos) SHALL atender apenas o formato avulso. `eh_participante(t_id)` SHALL considerar participants OU vaga comandada no torneio (técnicos veem torneio privado).

#### Scenario: Técnico vê torneio privado
- **WHEN** um técnico de vaga consulta um torneio privado em que comanda clube
- **THEN** a visibilidade é concedida via eh_participante

### Requirement: Políticas de tournament_slots
RLS SHALL garantir: SELECT para quem vê o torneio; INSERT/DELETE apenas pelo dono e apenas com o torneio em rascunho; UPDATE em dois caminhos — dono (esvaziar técnico a qualquer momento não-encerrado; editar clube só em rascunho) e o PRÓPRIO técnico (esvaziar a própria vaga). WITH CHECK SHALL impedir atribuir user_id não-nulo via UPDATE direto (atribuição só pelo RPC de aceite). Um trigger SHALL travar team_id/tournament_id fora do rascunho.

#### Scenario: Técnico só esvazia a si
- **WHEN** um técnico tenta por POST direto se trocar por outro usuário
- **THEN** o WITH CHECK recusa (só user_id nulo passa)

#### Scenario: Vagas nascem só no rascunho
- **WHEN** o dono tenta inserir vaga com o torneio ativo
- **THEN** a policy recusa

### Requirement: Políticas de slot_invites e RPCs de vaga
`slot_invites` SHALL ser legível/gravável apenas pelo dono do torneio. `aceitar_convite_vaga(codigo)` e `info_convite_vaga(codigo)` SHALL ser SECURITY DEFINER para authenticated: o aceite valida sessão, torneio não-encerrado e vaga vazia com UPDATE atômico filtrado; o unique parcial barra segundo clube do mesmo usuário.

#### Scenario: Código não vaza
- **WHEN** um não-dono consulta slot_invites
- **THEN** nenhuma linha retorna

#### Scenario: Aceite atômico
- **WHEN** dois usuários aceitam o mesmo convite simultaneamente
- **THEN** o UPDATE filtrado por user_id nulo garante exatamente um vencedor

### Requirement: RLS de match_wo_requests
A tabela `match_wo_requests` SHALL ter RLS estrita. INSERT SHALL ser permitido
apenas ao técnico de um dos slots da partida referenciada, com torneio ATIVO e
partida ABERTA (via função SECURITY DEFINER que espelha a lógica de
participação por vaga). SELECT SHALL devolver a solicitação ao técnico
solicitante E ao dono do torneio. UPDATE do veredito (`status`/`resolved_at`)
SHALL ser permitido apenas ao dono do torneio. DELETE SHALL ser negado a todos
(histórico imutável; service_role livre).

#### Scenario: Só o adversário solicita
- **WHEN** alguém que não é técnico de nenhum lado da partida tenta inserir uma
  solicitação
- **THEN** a RLS nega

#### Scenario: Só o dono resolve
- **WHEN** quem não é dono tenta atualizar o status de uma solicitação
- **THEN** a RLS nega

### Requirement: UPDATE de partida pelo dono cobre o W.O.
A policy `matches_update_tournament_owner` SHALL permitir ao dono gravar
`wo`/`wo_vencedor` junto com `status`/`placar` no mesmo UPDATE (marcar W.O.).
O trigger `lock_match_lifecycle` SHALL continuar barrando alteração de placar
de partida JÁ encerrada — marcar W.O. é sobre partida ABERTA (encerra na mesma
transação, `old.status <> 'encerrada'`).

#### Scenario: Dono marca W.O. em partida aberta
- **WHEN** o dono grava `wo=true, wo_vencedor, placar 0x0, status=encerrada`
  numa partida aberta do seu torneio ativo
- **THEN** a RLS e os triggers aceitam

#### Scenario: Não-dono não marca W.O.
- **WHEN** um técnico tenta gravar W.O. por POST direto
- **THEN** a policy de UPDATE do dono nega (técnico só altera placar do
  próprio lado, não `wo`)

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

