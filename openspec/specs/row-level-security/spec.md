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

