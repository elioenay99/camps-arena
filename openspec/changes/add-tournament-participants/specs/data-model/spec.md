# data-model — delta

## ADDED Requirements

### Requirement: Tabela de participantes
O sistema SHALL manter uma tabela `participants` com chave primária composta
(`tournament_id`, `user_id`), referências com `on delete cascade` para
`tournaments` e `users`, e `created_at`. Cada linha representa um participante
CONFIRMADO do torneio.

#### Scenario: Participação persistida
- **WHEN** um usuário entra num torneio
- **THEN** existe exatamente uma linha (torneio, usuário); nova tentativa não duplica

#### Scenario: Cascata na exclusão
- **WHEN** o torneio (ou o usuário) é excluído
- **THEN** as linhas de participação correspondentes são removidas

### Requirement: Tabela de convites de torneio
O sistema SHALL manter uma tabela `tournament_invites` com `tournament_id`
como chave primária (1:1, `on delete cascade`), `code` único e `created_at`.
O código SHALL ficar FORA de `tournaments` para não vazar pela visibilidade
pública do torneio.

#### Scenario: Um convite por torneio
- **WHEN** o código é regenerado
- **THEN** a mesma linha é atualizada (o torneio nunca tem dois códigos válidos)

#### Scenario: Código globalmente único
- **WHEN** um INSERT/UPDATE tenta gravar um código já existente
- **THEN** a constraint UNIQUE rejeita a operação
