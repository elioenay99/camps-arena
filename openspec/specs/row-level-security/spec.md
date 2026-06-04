# row-level-security Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: RLS habilitado nas tabelas
O sistema SHALL habilitar Row Level Security em `users`, `tournaments` e `matches`.

#### Scenario: Acesso negado sem política aplicável
- **WHEN** uma operação não coberta por nenhuma política é tentada
- **THEN** o banco rejeita a operação por padrão (deny-by-default)

### Requirement: Leitura pública de partidas
O sistema SHALL permitir SELECT em uma partida quando o torneio dela for visível ao solicitante (público, ou privado do próprio solicitante) ou quando o solicitante autenticado for participante da partida. Partidas de torneios privados de terceiros NÃO SHALL ser visíveis a quem não participa delas.

#### Scenario: Visitante lê partidas de torneio público
- **WHEN** um visitante (autenticado ou não) consulta partidas de um torneio público
- **THEN** os dados de placar são retornados

#### Scenario: Partida de torneio privado oculta de terceiros
- **WHEN** um usuário que não é dono do torneio nem participante consulta uma partida de torneio privado
- **THEN** a política RLS não retorna a partida

#### Scenario: Participante vê a própria partida em torneio privado de terceiro
- **WHEN** um participante autenticado da partida consulta a partida, mesmo sem ser dono do torneio privado
- **THEN** a partida é retornada

### Requirement: Escrita restrita ao dono da partida
O sistema SHALL permitir UPDATE em uma partida apenas para o usuário autenticado que é um dos participantes daquela partida.

#### Scenario: Dono atualiza placar
- **WHEN** um participante autenticado da partida envia um UPDATE de placar
- **THEN** a atualização é aceita

#### Scenario: Terceiro tenta atualizar
- **WHEN** um usuário que não participa da partida tenta o UPDATE
- **THEN** a política RLS rejeita a operação

### Requirement: Visibilidade de torneios por dono e público
O sistema SHALL permitir SELECT em um torneio quando ele for público (`is_public`) ou quando o solicitante autenticado for o dono (`created_by = auth.uid()`). Torneios privados de terceiros NÃO SHALL ser visíveis.

#### Scenario: Torneio público é visível a todos
- **WHEN** qualquer visitante (autenticado ou não) consulta um torneio público
- **THEN** o torneio é retornado

#### Scenario: Torneio privado visível só ao dono
- **WHEN** um usuário autenticado consulta um torneio privado que ele criou
- **THEN** o torneio é retornado

#### Scenario: Torneio privado de terceiro é ocultado
- **WHEN** um usuário consulta um torneio privado criado por outra pessoa
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
O sistema SHALL permitir INSERT em `matches` apenas quando o usuário autenticado for o dono (`created_by`) do torneio referenciado em `tournament_id` e o torneio não estiver `encerrado`. As demais operações de escrita não cobertas por policy permanecem negadas.

#### Scenario: Dono cria partida no próprio torneio
- **WHEN** o dono de um torneio não encerrado insere uma partida nesse torneio
- **THEN** a inserção é aceita

#### Scenario: Terceiro não cria partida em torneio alheio
- **WHEN** um usuário autenticado tenta inserir partida em torneio cujo dono é outra pessoa
- **THEN** a política RLS rejeita a operação

#### Scenario: Torneio encerrado não recebe partidas
- **WHEN** o dono tenta inserir partida em torneio com status `encerrado`
- **THEN** a política RLS rejeita a operação

