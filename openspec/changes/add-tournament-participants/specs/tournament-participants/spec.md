# tournament-participants — delta

## ADDED Requirements

### Requirement: Convite por link com código secreto
O sistema SHALL manter um código de convite por torneio em tabela própria
(`tournament_invites`, 1:1 com o torneio), legível e gerenciável SOMENTE pelo
dono do torneio. O código SHALL ser gerado no servidor com aleatoriedade
criptográfica (mínimo 16 caracteres de alfabeto sem ambíguos) e SHALL poder ser
regenerado pelo dono — a regeneração invalida o link anterior. O código NÃO
SHALL ser armazenado em coluna de `tournaments` (a visibilidade pública do
torneio vazaria o segredo).

#### Scenario: Dono vê e copia o link de convite
- **WHEN** o dono abre a página do próprio torneio
- **THEN** a seção de convite exibe o link `/convite/<codigo>` com ação de copiar

#### Scenario: Regenerar invalida o link antigo
- **WHEN** o dono regenera o código de convite
- **THEN** o link antigo deixa de aceitar entradas e o novo passa a valer

#### Scenario: Não-dono não acessa o código
- **WHEN** um usuário que não é o dono consulta `tournament_invites`
- **THEN** a RLS não retorna nenhuma linha

#### Scenario: Torneio legado sem convite
- **WHEN** o dono de um torneio criado antes desta funcionalidade abre a página
- **THEN** a seção de convite oferece gerar o primeiro código

### Requirement: Aceite explícito via página de convite
O sistema SHALL oferecer a rota pública `/convite/[codigo]`. Deslogado, a
página SHALL exibir chamadas para login/cadastro com retorno seguro à própria
página (`redirectTo` sanitizado). Logado, a página SHALL exibir o título do
torneio (via função `info_convite`) e um botão de entrada; a entrada SHALL
ocorrer apenas por ação explícita do usuário (função `aceitar_convite`,
`SECURITY DEFINER`, que valida o código, exige torneio não-encerrado e insere o
próprio `auth.uid()`). Código inválido SHALL receber mensagem única, sem
revelar se o torneio existe.

#### Scenario: Convidado deslogado é levado ao login e retorna
- **WHEN** um visitante deslogado abre `/convite/<codigo>` e entra na conta
- **THEN** ele retorna à página do convite para concluir o aceite

#### Scenario: Aceite cria a participação e leva ao torneio
- **WHEN** um usuário logado clica em entrar num convite válido de torneio não-encerrado
- **THEN** ele vira participante e é redirecionado à página do torneio

#### Scenario: Código inválido tem resposta única
- **WHEN** um usuário abre `/convite/<codigo-inexistente>`
- **THEN** a página informa "convite inválido" sem distinguir inexistente de revogado

#### Scenario: Torneio encerrado não aceita entrada
- **WHEN** o aceite é tentado num torneio com status `encerrado`
- **THEN** a entrada é rejeitada com mensagem clara

#### Scenario: Quem já participa não duplica
- **WHEN** um participante abre o próprio link de convite novamente
- **THEN** a página indica que ele já participa e oferece o link do torneio, sem criar linha duplicada

### Requirement: Participação confirmada sem estado intermediário
O sistema SHALL manter a tabela `participants` (chave composta
torneio+usuário); cada linha representa um participante CONFIRMADO — não
existe convite pendente persistido. O dono SHALL entrar automaticamente como
participante ao criar o torneio.

#### Scenario: Dono entra ao criar torneio
- **WHEN** um usuário cria um torneio
- **THEN** ele aparece na lista de participantes do torneio

#### Scenario: Entrada idempotente
- **WHEN** a inserção de um participante já existente é tentada
- **THEN** nenhuma duplicata é criada e a operação não falha

### Requirement: Sair e remover
O sistema SHALL permitir que o participante saia do torneio por conta própria
e que o dono remova qualquer participante. A remoção/saída NÃO SHALL apagar
nem alterar partidas já criadas (histórico preservado); o usuário apenas deixa
de ser elegível para NOVAS partidas. Ambas as operações SHALL exigir sessão e
conferir autorização no servidor além da RLS.

#### Scenario: Participante sai
- **WHEN** um participante aciona "Sair do torneio"
- **THEN** sua linha em `participants` é removida e as partidas dele permanecem

#### Scenario: Dono remove participante
- **WHEN** o dono remove um participante da lista
- **THEN** a linha é removida e o removido some dos selects de novas partidas

#### Scenario: Terceiro não remove ninguém
- **WHEN** um usuário que não é o dono tenta remover outro participante
- **THEN** a operação é rejeitada (action e RLS)

### Requirement: Lista de participantes na página do torneio
A página do torneio SHALL exibir a lista de participantes (nomes) a todo
usuário que enxerga o torneio. As ações SHALL respeitar o papel: dono vê
remover (e a gestão de convite); participante não-dono vê apenas a própria
saída.

#### Scenario: Lista visível a quem vê o torneio
- **WHEN** um usuário com acesso ao torneio abre a página
- **THEN** a seção de participantes lista os nomes confirmados

#### Scenario: Ações condicionadas ao papel
- **WHEN** um participante que não é dono abre a página
- **THEN** ele vê o botão de sair, mas não os controles de convite/remoção
