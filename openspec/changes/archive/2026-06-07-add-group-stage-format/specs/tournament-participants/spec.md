# tournament-participants — Delta Spec

## MODIFIED Requirements

### Requirement: Sair e remover
O sistema SHALL permitir que o participante saia do torneio por conta própria
e que o dono remova qualquer participante. A remoção/saída NÃO SHALL apagar
nem alterar partidas já criadas (histórico preservado); o usuário apenas deixa
de ser elegível para NOVAS partidas. Ambas as operações SHALL exigir sessão e
conferir autorização no servidor além da RLS. EXCEÇÃO: nos formatos COM CHAVE
(`mata_mata`, `grupos_mata_mata`, `fase_liga`) em estado congelado — `status =
'ativo'`, ou qualquer status fora de `rascunho` com partidas geradas (alguma
partida com `rodada`) — sair e remover SHALL ser bloqueados (action com
mensagem clara E policy de DELETE no banco): a chave atual ou FUTURA (a
geração do mata-mata dos grupos acontece depois) exige cada semeado em
`participants`, e torneio encerrado é reabrível. Em rascunho as operações
permanecem livres; liga e avulso permanecem livres em qualquer status.

#### Scenario: Participante sai
- **WHEN** um participante aciona "Sair do torneio" (formato avulso, liga, ou formato com chave ainda em rascunho)
- **THEN** sua linha em `participants` é removida e as partidas dele permanecem

#### Scenario: Dono remove participante
- **WHEN** o dono remove um participante da lista
- **THEN** a linha é removida e o removido some dos selects de novas partidas

#### Scenario: Terceiro não remove ninguém
- **WHEN** um usuário que não é o dono tenta remover outro participante
- **THEN** a operação é rejeitada (action e RLS)

#### Scenario: Formato com chave congela a lista
- **WHEN** sair ou remover é tentado num mata-mata, grupos ou fase de liga em estado congelado (ativo, ou com partidas geradas fora do rascunho) — pela UI (botões ausentes) ou por requisição direta
- **THEN** a action rejeita com mensagem clara e a policy de DELETE bloqueia o acesso direto ao banco

#### Scenario: Cancelado no rascunho segue livre
- **WHEN** sair ou remover é tentado num formato com chave encerrado SEM partidas geradas (cancelado antes de iniciar)
- **THEN** a operação é aceita normalmente
