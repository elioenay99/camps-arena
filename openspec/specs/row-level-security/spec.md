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

O sistema SHALL permitir SELECT em uma partida quando o solicitante for o **dono do
torneio** dela (`tournaments.created_by = auth.uid()`, o que inclui divisões de pirâmide,
que são `tournaments`), **sem qualquer restrição de liberação** — o dono vê todas as suas
partidas.

Para qualquer outro solicitante (público/anônimo, participante do torneio via
`eh_participante()`, ou o próprio jogador/técnico da partida), o SELECT SHALL ser permitido
**apenas quando a partida estiver liberada** (`liberada_em is not null and liberada_em <=
now()`) E o torneio for visível a ele (público, ou ele participa) ou ele for jogador/técnico
da partida. Partidas **ocultas** (`liberada_em` nulo ou no futuro) NÃO SHALL ser visíveis a
ninguém além do dono — inclusive o adversário de uma rodada ainda não liberada NÃO SHALL
ver o confronto.

Partidas de torneios privados de terceiros SHALL continuar invisíveis a quem não participa
do torneio nem da partida.

#### Scenario: Visitante só lê rodadas liberadas de torneio público

- **WHEN** um visitante (autenticado ou não) consulta partidas de um torneio público com
  rodadas ocultas
- **THEN** apenas as partidas com `liberada_em <= now()` são retornadas; as ocultas não

#### Scenario: Dono vê todas as rodadas, inclusive ocultas

- **WHEN** o dono do torneio consulta as partidas
- **THEN** todas são retornadas, liberadas ou não

#### Scenario: Jogador não vê a própria partida antes de liberada

- **WHEN** o jogador (participante_1/2 ou técnico de uma vaga) de uma partida ainda oculta
  consulta essa partida
- **THEN** a política RLS não retorna a partida enquanto ela não for liberada

#### Scenario: Jogador vê a própria partida depois de liberada

- **WHEN** a rodada é liberada e o jogador consulta a própria partida
- **THEN** a partida é retornada

#### Scenario: Participante do torneio vê só o liberado em torneio privado

- **WHEN** um participante confirmado consulta as partidas de um torneio privado com
  rodadas ocultas
- **THEN** só as rodadas liberadas são retornadas (as ocultas não, mesmo sendo participante)

### Requirement: Escrita restrita ao dono da partida

Partidas AVULSAS: o participante (participante_1/2 = auth.uid()) ou o dono do torneio SHALL
poder atualizar placar/clube. Partidas COMPETITIVAS: SHALL poder atualizar quem for TÉCNICO
de uma das vagas da partida ou o dono do torneio.

Para o caminho do **participante/técnico** (não-dono), o UPDATE SHALL ser permitido apenas
quando a partida estiver **liberada** (`liberada_em is not null and liberada_em <= now()`),
tanto no `using` quanto no `with check`. Em consequência, o participante NÃO SHALL conseguir
(a) alterar uma partida oculta, nem (b) **ocultar** (`liberada_em = null`) ou **agendar**
(`liberada_em > now()`) uma partida liberada — a guarda no `with check` rejeita ambos. Fica
um resíduo aceito no v1: numa partida já liberada, o participante poderia reescrever
`liberada_em` para OUTRO instante passado (que ainda satisfaz `<= now()`); isso é inócuo
porque `liberada_em` é consumido apenas como booleano (`<= now()`) — a partida segue
liberada. Endurecer essa coluna (defesa de coluna no trigger, "só o dono altera
`liberada_em`") fica como follow-up se a evolução (agendamento/auditoria da change 3) passar
a depender do valor exato.

O caminho do **dono** (`matches_update_tournament_owner`) SHALL permanecer sem restrição de
liberação: o dono altera qualquer partida sua, inclusive `liberada_em` (é por ele que a
liberação acontece). Status segue restrito ao dono (trigger), como hoje.

#### Scenario: Técnico lança placar em partida liberada

- **WHEN** o técnico atual de um dos clubes atualiza o placar de uma partida liberada
- **THEN** a escrita passa (RLS + trigger de lifecycle)

#### Scenario: Técnico não escreve em partida oculta

- **WHEN** o técnico tenta atualizar uma partida com `liberada_em` nulo/futuro
- **THEN** a escrita é negada pela RLS

#### Scenario: Participante não oculta nem agenda a própria partida

- **WHEN** um participante tenta, via POST direto, setar `liberada_em = null` ou um instante
  futuro na própria partida liberada
- **THEN** o `with check` rejeita a escrita (a partida não pode ser ocultada nem agendada
  pelo participante)

#### Scenario: Dono libera a rodada

- **WHEN** o dono atualiza `liberada_em` das partidas de uma rodada
- **THEN** a escrita passa (policy do dono), sem depender da guarda de liberação

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
participação por vaga). Quando `foto_path` for informado (é OPCIONAL nesta tabela),
o INSERT SHALL amarrá-lo à pasta do autor: `foto_path is null` OU
`(storage.foldername(foto_path))[1] = (select auth.uid())::text` e
`(storage.foldername(foto_path))[2] = match_id::text` — impedindo que um cliente que
pule a Server Action registre uma solicitação cujo `foto_path` aponte para a pasta de
OUTRO usuário. SELECT SHALL devolver a solicitação ao técnico
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

#### Scenario: Foto opcional amarrada à pasta do autor
- **WHEN** um cliente insere uma solicitação de W.O. com `foto_path` cujo primeiro
  segmento não é o `auth.uid()` dele (ou cujo segundo segmento não é o `match_id`)
- **THEN** a RLS nega o INSERT; uma solicitação sem foto (`foto_path is null`) ou com
  a foto na pasta `<uid>/<match_id>/` continua aceita

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

### Requirement: Coluna `celular` (PII) restrita a co-participantes

O número de telefone (`public.users.celular`) é PII e NÃO SHALL ser legível por um usuário
autenticado qualquer. A coluna `celular` SHALL ser protegida por **grant de coluna** (não
pela row-policy, que permanece ampla para `nome`/`avatar`): o `SELECT` da coluna `celular`
SHALL ser revogado de `anon` e `authenticated`, restando legível apenas por caminho
`SECURITY DEFINER` que aplique o predicado de co-participação.

O sistema SHALL prover um predicado `public.eh_co_participante(uuid) → boolean`
(`SECURITY DEFINER`, `set search_path=''`, `EXECUTE` revogado de `public` e concedido a
`anon, authenticated`) que é verdadeiro quando `auth.uid()` e o argumento compartilham um
mesmo torneio por qualquer caminho de pertencimento (dono, jogador avulso ou técnico de
vaga). O sistema SHALL prover a função `public.celulares_de_contato(uuid[]) →
table(user_id uuid, celular text)` (`SECURITY DEFINER`, `EXECUTE` só para `authenticated`)
que devolve o `celular` de um id APENAS quando esse id é o próprio solicitante OU
`eh_co_participante(id)` é verdadeiro.

A row-policy `users_select_authenticated` SHALL permanecer `using (true)` para preservar a
visibilidade de `nome`/`avatar` (necessária em torneios públicos avulsos). A auto-edição do
próprio `celular` (UPDATE) e a gravação no cadastro (trigger `handle_new_user`) NÃO SHALL
ser afetadas pelo revoke de `SELECT` de coluna.

#### Scenario: Leitura direta da coluna é negada

- **WHEN** um cliente `authenticated` tenta `GET /rest/v1/users?select=id,celular`
- **THEN** a leitura da coluna `celular` é negada (sem grant), enquanto `id`/`nome`/`avatar`
  seguem legíveis

#### Scenario: Co-participante obtém o telefone pela RPC

- **WHEN** o dono de um torneio (ou o adversário numa partida) chama
  `celulares_de_contato([id_do_outro])` e ambos compartilham o torneio
- **THEN** a RPC devolve o `celular` do outro, alimentando o atalho `wa.me`

#### Scenario: Não-participante não obtém o telefone

- **WHEN** um logado que NÃO compartilha torneio com o alvo chama
  `celulares_de_contato([id_do_alvo])` (ou vê um torneio público de terceiros)
- **THEN** a RPC não devolve linha para esse id (telefone fica indisponível), embora
  `nome`/`avatar` e placares continuem visíveis

#### Scenario: Próprio telefone sempre resolve (sem torneio)

- **WHEN** um usuário sem nenhum torneio chama `celulares_de_contato([self])`
- **THEN** recebe o próprio `celular` (branch `id = auth.uid()`, independente de participação)

#### Scenario: Baseline do `anon` preservado após o revoke

- **WHEN** o papel `anon` consulta `public.users` ou a view `public.users_public` após o
  revoke do `SELECT` de coluna
- **THEN** recebe ZERO linhas pela RLS (sem policy de SELECT para `anon`), porém SEM erro de
  permissão de coluna — graças ao re-grant `select (id, nome, avatar, created_at)` a `anon`

### Requirement: Superfície mínima da API PostgREST e do Storage

O sistema SHALL minimizar a superfície exposta pela API PostgREST e pelo Storage, revogando
acessos que não correspondem a um uso público deliberado.

Funções `SECURITY DEFINER` que existem APENAS como gatilho de trigger ou como helper de
política RLS NÃO SHALL ser executáveis pelos papéis `anon`/`authenticated`/`public` via
`/rest/v1/rpc/...` — o `EXECUTE` SHALL ser revogado desses papéis. Somente RPCs deliberadamente
públicas (que validam posse/credencial internamente — ex.: `montar_*`, `aceitar_*`, `info_convite*`)
SHALL permanecer executáveis, com o papel mínimo necessário.

Views em `public` que projetam um subconjunto seguro de uma tabela com RLS SHALL usar
`security_invoker = on` (não `SECURITY DEFINER`), de modo que a RLS e os grants de coluna do
papel que consulta sejam aplicados — exceto quando houver justificativa documentada para o
contrário.

Buckets de Storage públicos NÃO SHALL ter política `SELECT` ampla em `storage.objects` que
permita LISTAR todos os arquivos; o acesso público SHALL se dar por URL de objeto.

Todo bucket de Storage (público ou privado) SHALL declarar `file_size_limit` e
`allowed_mime_types` no próprio bucket, batendo com os limites validados na Server Action
correspondente — de modo que um cliente que pule a action não consiga subir arquivo de tipo
ou tamanho arbitrário direto no Storage. Em particular, o bucket público `avatars` SHALL ter
`file_size_limit = 2097152` (2 MiB) e `allowed_mime_types` cobrindo `image/jpeg`,
`image/png`, `image/webp` e `image/gif` (os tipos aceitos por `atualizarAvatar`/`AvatarUpload`),
mantendo `public = true`.

#### Scenario: Trigger function não é chamável como RPC

- **WHEN** um cliente `anon` ou `authenticated` tenta `POST /rest/v1/rpc/lock_match_lifecycle`
  (ou qualquer outra função de trigger/helper de RLS)
- **THEN** a chamada é negada por falta de `EXECUTE`, enquanto o trigger correspondente continua
  disparando normalmente nas operações de tabela

#### Scenario: View de perfil público respeita a RLS do consumidor

- **WHEN** a view `public.users_public` é consultada
- **THEN** ela roda com `security_invoker = on`, aplicando a RLS e os grants de coluna do papel
  que consulta, sem expor colunas sensíveis (ex.: `celular`) além do projetado

#### Scenario: Bucket público não permite listagem

- **WHEN** um cliente tenta listar os arquivos do bucket `avatars`
- **THEN** a listagem é negada (não há política SELECT ampla), mas cada objeto continua acessível
  pela sua URL pública

#### Scenario: Bucket avatars rejeita tipo/tamanho fora do limite

- **WHEN** um cliente que pule a action tenta subir no bucket `avatars` um arquivo maior que
  2 MiB ou de MIME fora de `{image/jpeg, image/png, image/webp, image/gif}`
- **THEN** o Storage recusa o upload pelos limites declarados no bucket

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

### Requirement: foto_path de proposta de placar amarrado à pasta do autor

A RLS de INSERT de `match_score_proposals` SHALL amarrar a coluna `foto_path` (que é
`NOT NULL`) à pasta do autor no bucket de evidências, na policy
`match_score_proposals_insert_tecnico`: o primeiro segmento de pasta SHALL ser o
`auth.uid()` do submissor e o
segundo SHALL ser o `match_id` da proposta — i.e.
`(storage.foldername(foto_path))[1] = (select auth.uid())::text` e
`(storage.foldername(foto_path))[2] = match_id::text`, além de preservar
`submetido_por = (select auth.uid())` e a elegibilidade (partida liberada, aberta,
jogador de uma das vagas). Isso SHALL impedir que um cliente que pule a Server Action
insira uma linha cujo `foto_path` aponte para a pasta de OUTRO usuário (confused
deputy: a SELECT policy de `match_evidence` concederia leitura daquele objeto a quem
enxerga a proposta). O path emitido pela action (`<uid>/<match_id>/<uuid>.<ext>`)
SHALL satisfazer o critério — nenhum insert legítimo é rejeitado.

#### Scenario: Insert com foto na própria pasta é aceito

- **WHEN** o técnico propõe placar com `foto_path = <seu-uid>/<match_id>/<uuid>.jpg`
  numa partida liberada e aberta em que ele joga
- **THEN** a RLS aceita o INSERT

#### Scenario: Insert com foto na pasta de outro é negado

- **WHEN** um cliente insere `match_score_proposals` direto no PostgREST com
  `foto_path` cujo primeiro segmento não é o `auth.uid()` dele (ou cujo segundo
  segmento não é o `match_id`)
- **THEN** a RLS nega o INSERT

### Requirement: Cobertura de testes de integração das policies RLS

O projeto SHALL manter uma suíte de testes de INTEGRAÇÃO que exercita as policies
RLS e os triggers/funções de segurança reais de `supabase/schema.sql` contra um
PostgreSQL de verdade (via pgTAP), e NÃO por mocks. A suíte SHALL simular o usuário
logado de forma realista: um `auth.uid()` que lê o `sub` de `request.jwt.claims`
(injetado por teste) e a execução sob o papel do banco correspondente
(`anon`/`authenticated`), de modo que as policies e os SECURITY DEFINER decidam
como em produção. A suíte SHALL ser SEPARADA do run de testes hermético (que roda
sem banco): um comando próprio (`pnpm test:rls`) e diretório próprio
(`supabase/tests/`). A suíte SHALL provar, no mínimo, tanto ALLOW quanto DENY para
cada área coberta, rodando a MESMA consulta sob identidades diferentes quando isso
distingue autorização de vazamento. A suíte NÃO SHALL tocar nenhum banco de
produção nem exigir segredos — roda contra um Postgres efêmero com dados fictícios.

#### Scenario: Vazamento de rascunho fechado

- **WHEN** o teste consulta, sob a identidade de um terceiro logado, um torneio privado (ou uma pirâmide arquivada) de outro dono
- **THEN** a policy `*_select_visivel` retorna zero linhas, e a MESMA consulta sob a identidade do dono retorna a linha — provando que a visibilidade discrimina por identidade

#### Scenario: Só o participante escreve na própria partida liberada

- **WHEN** o teste, sob a identidade de `participante_1`, atualiza uma partida liberada, e depois, sob a identidade de um terceiro, tenta a mesma atualização
- **THEN** a primeira afeta uma linha (`matches_update_participant`) e a segunda afeta zero linhas (negada pela RLS)

#### Scenario: Invariante de vaga por-nome pelo trigger

- **WHEN** o teste, mesmo sob a identidade do dono do torneio, tenta inserir um convite (`slot_invites`) para uma vaga POR-NOME (`team_id` nulo)
- **THEN** o trigger `block_slot_invite_por_nome` levanta a exceção `SLOT_POR_NOME`, e o convite para uma vaga team-based legítima é aceito

#### Scenario: foto_path amarrado à pasta do autor

- **WHEN** o teste, sob a identidade do técnico, insere uma proposta de placar com `foto_path` apontando para a pasta de OUTRO usuário
- **THEN** a policy `match_score_proposals_insert_tecnico` nega a inserção (erro de RLS), e uma proposta com `foto_path` na própria pasta (`<uid>/<match_id>/...`) é aceita

#### Scenario: PII celular fechada por grant de coluna

- **WHEN** o teste, sob o papel `authenticated` (ou `anon`), seleciona a coluna `celular` de `public.users`
- **THEN** o banco nega por privilégio de coluna (`42501`), enquanto o SELECT de colunas não-PII (ex.: `nome`) é permitido

### Requirement: Políticas de match_goals
A tabela `public.match_goals` SHALL ter RLS habilitado. A LEITURA (SELECT, para
`anon` e `authenticated`) SHALL espelhar a visibilidade da partida
(`matches_select_visivel`): só é visível o gol de uma partida que o usuário pode
ver — capacidade de ver bastidores do torneio, OU partida liberada
(`liberada_em <= now()`) de torneio público/participado, OU o próprio
participante/técnico de vaga. Gols de rodada OCULTA (não liberada) NÃO SHALL
vazar. A ESCRITA (INSERT/DELETE, para `authenticated`) SHALL derivar de quem
grava placar direto: capacidade ARBITRAR no competitivo
(`pode_arbitrar_torneio(m.tournament_id)`) OU participante do avulso
(`m.participante_1/2 = auth.uid()`) em partida liberada e não encerrada —
espelho de `matches_update_tournament_owner` + `matches_update_participant`. NÃO
SHALL haver policy de escrita para o técnico de vaga (o caminho dele é a proposta,
materializada pela RPC SECURITY DEFINER que ignora RLS). Os grants SHALL conceder
`select` a `anon`+`authenticated` e `insert, delete` a `authenticated`.

#### Scenario: Leitura acompanha a visibilidade da partida
- **WHEN** um anônimo lê gols de uma partida liberada de um torneio público
- **THEN** os gols são retornados

#### Scenario: Gol de rodada oculta não vaza
- **WHEN** um usuário sem capacidade de bastidores lê gols de uma partida de rodada não liberada
- **THEN** nenhuma linha é retornada

#### Scenario: Só quem grava placar escreve gols
- **WHEN** quem tem capacidade ARBITRAR (competitivo) ou o participante do avulso insere/apaga gols de uma partida não encerrada
- **THEN** a operação é permitida

#### Scenario: Técnico de vaga não escreve gols direto
- **WHEN** o técnico de uma vaga competitiva tenta inserir em `match_goals` direto
- **THEN** a RLS nega (o caminho é a proposta, materializada na aprovação)

### Requirement: Conquistas são somente-leitura via cliente; escrita só pela RPC autoritativa
A tabela `public.conquistas` SHALL ter RLS habilitado. A LEITURA (SELECT, para
`anon` e `authenticated`) SHALL espelhar a visibilidade do competidor
(`league_competitors_select_visivel`): um troféu é legível quando a competição do
competidor está `ativa`, OU o solicitante é o dono da competição, OU tem
capacidade de ver bastidores (`pode_ver_bastidores_competition`). NÃO SHALL haver
policy NEM grant de INSERT/UPDATE/DELETE para qualquer papel — o ÚNICO writer
SHALL ser a RPC `SECURITY DEFINER` de premiação (que ignora RLS). Os grants
SHALL conceder APENAS `select` a `anon` e `authenticated`. Isto garante, no
banco, que nenhum troféu é gravado por caminho não-autoritativo.

#### Scenario: Leitura acompanha a visibilidade do competidor
- **WHEN** um anônimo lê os troféus de um competidor de uma competição pública (ativa)
- **THEN** os troféus são retornados

#### Scenario: Escrita direta pelo cliente é negada
- **WHEN** um usuário autenticado tenta inserir/atualizar/apagar uma linha em `conquistas` via PostgREST
- **THEN** a operação é negada (não há grant nem policy de escrita)

#### Scenario: Troféu de competição privada não vaza
- **WHEN** um usuário sem posse nem bastidores lê troféus de uma competição não-ativa/privada
- **THEN** nenhuma linha é retornada

### Requirement: RPC de premiação re-verifica posse, estado e pertencimento
A RPC `registrar_conquistas_temporada(uuid, jsonb)` SHALL ser `SECURITY DEFINER`
com `search_path = ''`, com EXECUTE revogado de `public`/`anon` e concedido a
`authenticated`. Ela SHALL exigir `auth.uid()` como dono da liga e a temporada no
estado de fechamento (`em_fluxo` ou `encerrada`) ANTES de gravar. SHALL ser
idempotente (delete-then-insert do escopo da temporada) e SHALL validar que o
competidor de cada prêmio do payload PERTENCE à temporada antes de aceitá-lo. Os
casts do payload SHALL ser guardados por tipo (`jsonb_typeof` em `nivel`/
`valor_num`; validação de UUID em `competitor_id`) — uma linha malformada SHALL
ser IGNORADA, nunca abortando a RPC (que é fatal no caminho de encerramento).

#### Scenario: Não-dono é recusado
- **WHEN** um usuário que não é dono da liga chama `registrar_conquistas_temporada` para aquela temporada
- **THEN** a RPC lança exceção e nada é gravado

#### Scenario: Prêmio para competidor fora da temporada é ignorado
- **WHEN** o payload traz um prêmio para um competidor que não pertence à temporada
- **THEN** esse prêmio é descartado (não gravado)

#### Scenario: Payload malformado não aborta a premiação
- **WHEN** o payload traz um elemento com `competitor_id` não-UUID ou `valor_num` não-numérico
- **THEN** esse elemento é ignorado e os demais troféus são gravados normalmente

