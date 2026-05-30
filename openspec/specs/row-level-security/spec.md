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

