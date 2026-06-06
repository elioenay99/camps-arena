# tournament-participants — Delta Spec

## MODIFIED Requirements

### Requirement: Aceite explícito via página de convite
O sistema SHALL oferecer a rota pública `/convite/[codigo]`. Deslogado, a
página SHALL exibir chamadas para login/cadastro com retorno seguro à própria
página (`redirectTo` sanitizado). Logado, a página SHALL exibir o título do
torneio (via função `info_convite`) e um botão de entrada; a entrada SHALL
ocorrer apenas por ação explícita do usuário (função `aceitar_convite`,
`SECURITY DEFINER`, que valida o código, exige torneio não-encerrado, rejeita
formato GERADO já iniciado — `formato` em `('liga', 'mata_mata')` com `status`
diferente de `rascunho` — e insere o próprio `auth.uid()`). A página SHALL
explicar o bloqueio de torneio iniciado ANTES do clique (a função
`info_convite` expõe formato e status). Código inválido SHALL receber mensagem
única, sem revelar se o torneio existe.

#### Scenario: Convidado deslogado é levado ao login e retorna
- **WHEN** um visitante deslogado abre `/convite/<codigo>` e entra na conta
- **THEN** ele retorna à página do convite para concluir o aceite

#### Scenario: Aceite cria a participação e leva ao torneio
- **WHEN** um usuário logado clica em entrar num convite válido de torneio não-encerrado (e, se liga ou mata-mata, ainda em rascunho)
- **THEN** ele vira participante e é redirecionado à página do torneio

#### Scenario: Código inválido tem resposta única
- **WHEN** um usuário abre `/convite/<codigo-inexistente>`
- **THEN** a página informa "convite inválido" sem distinguir inexistente de revogado

#### Scenario: Torneio encerrado não aceita entrada
- **WHEN** o aceite é tentado num torneio com status `encerrado`
- **THEN** a entrada é rejeitada com mensagem clara

#### Scenario: Liga iniciada não aceita entrada
- **WHEN** o aceite é tentado numa liga com status diferente de `rascunho`
- **THEN** a entrada é rejeitada pela função com mensagem clara e a página já explicava o bloqueio antes do clique

#### Scenario: Mata-mata iniciado não aceita entrada
- **WHEN** o aceite é tentado num mata-mata com status diferente de `rascunho`
- **THEN** a entrada é rejeitada pela função com mensagem clara e a página já explicava o bloqueio antes do clique

#### Scenario: Quem já participa não duplica
- **WHEN** um participante abre o próprio link de convite novamente
- **THEN** a página indica que ele já participa e oferece o link do torneio, sem criar linha duplicada

### Requirement: Sair e remover
O sistema SHALL permitir que o participante saia do torneio por conta própria
e que o dono remova qualquer participante. A remoção/saída NÃO SHALL apagar
nem alterar partidas já criadas (histórico preservado); o usuário apenas deixa
de ser elegível para NOVAS partidas. Ambas as operações SHALL exigir sessão e
conferir autorização no servidor além da RLS. EXCEÇÃO: em torneio `mata_mata`
com `status = 'ativo'`, sair e remover SHALL ser bloqueados (action com
mensagem clara E policy de DELETE no banco) — a chave avança fase a fase e o
INSERT da fase seguinte exige cada vencedor em `participants`; uma saída no
meio travaria o avanço permanentemente. Em rascunho (chave não gerada) e em
torneio encerrado as operações permanecem livres.

#### Scenario: Participante sai
- **WHEN** um participante aciona "Sair do torneio" (formato avulso, liga, ou mata-mata fora de ativo)
- **THEN** sua linha em `participants` é removida e as partidas dele permanecem

#### Scenario: Dono remove participante
- **WHEN** o dono remove um participante da lista
- **THEN** a linha é removida e o removido some dos selects de novas partidas

#### Scenario: Terceiro não remove ninguém
- **WHEN** um usuário que não é o dono tenta remover outro participante
- **THEN** a operação é rejeitada (action e RLS)

#### Scenario: Mata-mata ativo congela a lista
- **WHEN** sair ou remover é tentado num torneio mata-mata com status ativo — pela UI (botões ausentes) ou por requisição direta
- **THEN** a action rejeita com mensagem clara e a policy de DELETE bloqueia o acesso direto ao banco
