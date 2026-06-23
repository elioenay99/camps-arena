## ADDED Requirements

### Requirement: Integridade do cache global de clubes

O sistema SHALL impor, no banco, sanidade mínima dos clubes inseridos no cache global: o nome
SHALL ter entre 1 e 80 caracteres após remover espaços nas bordas, e o identificador externo
SHALL ser nulo ou numérico. A regra SHALL valer para qualquer caminho de escrita (incluindo
acesso direto ao PostgREST), não apenas pela Server Action.

#### Scenario: Nome vazio ou grande é recusado pelo banco

- **WHEN** uma escrita tenta inserir um clube com nome vazio (só espaços) ou acima de 80 caracteres
- **THEN** o banco recusa a inserção pela restrição de integridade

#### Scenario: Cache segue aberto a usuários autenticados

- **WHEN** um usuário autenticado insere um clube válido no cache
- **THEN** a inserção é aceita (o cache de clubes permanece global e compartilhado)
