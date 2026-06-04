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
O sistema SHALL permitir SELECT público nas partidas para exibição de placares.

#### Scenario: Visitante lê partidas
- **WHEN** um visitante não autenticado consulta as partidas
- **THEN** os dados de placar são retornados

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

