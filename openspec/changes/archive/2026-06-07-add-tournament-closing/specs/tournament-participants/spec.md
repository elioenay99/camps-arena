# tournament-participants — Delta Spec

## MODIFIED Requirements

### Requirement: Sair e remover
O sistema SHALL permitir que o participante saia do torneio por conta própria
e que o dono remova qualquer participante. A remoção/saída NÃO SHALL apagar
nem alterar partidas já criadas (histórico preservado); o usuário apenas deixa
de ser elegível para NOVAS partidas. Ambas as operações SHALL exigir sessão e
conferir autorização no servidor além da RLS. EXCEÇÃO: em torneio `mata_mata`
com a CHAVE GERADA — `status = 'ativo'`, ou `encerrado` com partidas geradas
(qualquer partida com `rodada`) — sair e remover SHALL ser bloqueados (action
com mensagem clara E policy de DELETE no banco): a chave avança fase a fase e
o INSERT da fase seguinte exige cada vencedor em `participants`; e como
torneio encerrado é REABRÍVEL, a sequência encerrar → sair → reabrir recriaria
o travamento permanente do avanço. Em rascunho (chave não gerada) as operações
permanecem livres; liga e avulso permanecem livres em qualquer status.

#### Scenario: Participante sai
- **WHEN** um participante aciona "Sair do torneio" (formato avulso, liga, ou mata-mata sem chave gerada)
- **THEN** sua linha em `participants` é removida e as partidas dele permanecem

#### Scenario: Dono remove participante
- **WHEN** o dono remove um participante da lista
- **THEN** a linha é removida e o removido some dos selects de novas partidas

#### Scenario: Terceiro não remove ninguém
- **WHEN** um usuário que não é o dono tenta remover outro participante
- **THEN** a operação é rejeitada (action e RLS)

#### Scenario: Mata-mata com chave gerada congela a lista
- **WHEN** sair ou remover é tentado num mata-mata ativo, ou encerrado cuja chave foi gerada — pela UI (botões ausentes) ou por requisição direta
- **THEN** a action rejeita com mensagem clara e a policy de DELETE bloqueia o acesso direto ao banco

#### Scenario: Mata-mata cancelado no rascunho segue livre
- **WHEN** sair ou remover é tentado num mata-mata encerrado SEM partidas geradas (cancelado antes de iniciar)
- **THEN** a operação é aceita normalmente
