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
O sistema SHALL permitir UPDATE em uma partida para o usuário autenticado que é um dos participantes daquela partida OU para o dono do torneio da partida. Um trigger SHALL garantir que (a) a coluna `status` só mude quando o autor é o dono do torneio (`service_role` isento) e (b) o placar de partida `encerrada` não mude para nenhum papel, exceto `service_role`.

#### Scenario: Participante atualiza placar
- **WHEN** um participante autenticado da partida envia um UPDATE de placar em partida não-encerrada
- **THEN** a atualização é aceita

#### Scenario: Terceiro tenta atualizar
- **WHEN** um usuário que não participa da partida nem é dono do torneio tenta o UPDATE
- **THEN** a política RLS rejeita a operação

#### Scenario: Participante tenta mudar status por POST direto
- **WHEN** um participante (não-dono do torneio) envia UPDATE alterando `status`
- **THEN** o trigger bloqueia a operação

#### Scenario: Dono do torneio encerra e reabre
- **WHEN** o dono do torneio envia UPDATE de `status` numa partida do seu torneio
- **THEN** a operação é aceita pela policy e pelo trigger

#### Scenario: Placar de encerrada bloqueado no banco
- **WHEN** qualquer usuário (exceto `service_role`) tenta alterar placar de partida encerrada
- **THEN** o trigger bloqueia a operação

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
O sistema SHALL permitir INSERT em `matches` apenas quando o usuário autenticado for o dono (`created_by`) do torneio referenciado em `tournament_id`, o torneio não estiver `encerrado` E cada participante informado (não nulo) for participante confirmado do torneio em `participants`. As demais operações de escrita não cobertas por policy permanecem negadas.

#### Scenario: Dono cria partida no próprio torneio
- **WHEN** o dono de um torneio não encerrado insere uma partida com participantes do torneio (ou nulos)
- **THEN** a inserção é aceita

#### Scenario: Terceiro não cria partida em torneio alheio
- **WHEN** um usuário autenticado tenta inserir partida em torneio cujo dono é outra pessoa
- **THEN** a política RLS rejeita a operação

#### Scenario: Torneio encerrado não recebe partidas
- **WHEN** o dono tenta inserir partida em torneio com status `encerrado`
- **THEN** a política RLS rejeita a operação

#### Scenario: Participante fora da lista é barrado no banco
- **WHEN** um INSERT direto referencia como participante um usuário que não está em `participants` do torneio
- **THEN** a política RLS rejeita a operação

### Requirement: Políticas de participants
O sistema SHALL permitir SELECT em `participants` quando o torneio
correspondente for visível ao solicitante; INSERT direto apenas para o DONO do
torneio inserindo a si mesmo (`user_id = auth.uid()`) — convidados entram
exclusivamente pela função `aceitar_convite`; DELETE para o próprio
participante (sair) ou para o dono do torneio (remover). UPDATE NÃO SHALL ser
permitido.

#### Scenario: Lista visível junto com o torneio
- **WHEN** um usuário que enxerga o torneio consulta os participantes dele
- **THEN** as linhas são retornadas

#### Scenario: Entrada direta de terceiro é negada
- **WHEN** um usuário tenta INSERT direto em `participants` de torneio que não é dele (sem passar pela função de aceite)
- **THEN** a política RLS rejeita a operação

#### Scenario: Sair e remover cobertos por DELETE
- **WHEN** o próprio participante (ou o dono do torneio) executa DELETE da linha
- **THEN** a operação é aceita; para qualquer outro usuário é rejeitada

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
O sistema SHALL definir as funções `eh_participante(uuid)`, `aceitar_convite(text)` e `info_convite(text)` como `SECURITY DEFINER` com `search_path = ''`.
`aceitar_convite` SHALL exigir usuário autenticado, validar o código, rejeitar
torneio `encerrado` e inserir SOMENTE o próprio `auth.uid()` de forma
idempotente. `info_convite` SHALL expor apenas dados mínimos do torneio
(id, título, status, se já participa) a partir de um código válido.

#### Scenario: Aceite sem sessão é rejeitado
- **WHEN** `aceitar_convite` é chamada sem usuário autenticado
- **THEN** a função falha sem inserir nada

#### Scenario: Função não insere terceiros
- **WHEN** `aceitar_convite` é executada
- **THEN** a única linha possível de inserção é a do próprio `auth.uid()`

#### Scenario: Código inválido falha de forma única
- **WHEN** `aceitar_convite` ou `info_convite` recebem código inexistente
- **THEN** a resposta não distingue inexistente de revogado

