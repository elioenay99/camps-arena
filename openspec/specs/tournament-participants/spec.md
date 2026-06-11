# tournament-participants Specification

## Purpose
TBD - created by archiving change add-tournament-participants. Update Purpose after archive.
## Requirements
### Requirement: Convite por link com código secreto
O convite GENÉRICO de torneio (código único por torneio) SHALL existir apenas para o formato AVULSO. Formatos competitivos usam convite POR VAGA (capability club-slots). A página `/convite/[codigo]` SHALL atender os dois: tenta o convite de vaga e faz fallback ao genérico.

#### Scenario: Código de vaga na rota única
- **WHEN** alguém abre /convite/{code} de uma vaga
- **THEN** a página resolve via info_convite_vaga e oferece assumir o clube

#### Scenario: Código genérico de avulso
- **WHEN** o code é de tournament_invites (avulso)
- **THEN** o fluxo atual de aceite é oferecido

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
Sair/remover via participants SHALL valer apenas para o formato AVULSO, sem congelamento (avulso não tem disputa gerada). Em formatos competitivos, sair = DESISTIR da vaga e remover = EXPULSAR técnico (capability club-slots), ambos livres até o encerramento.

#### Scenario: Avulso sem congelamento
- **WHEN** um participante de avulso sai
- **THEN** o DELETE passa em qualquer status não-encerrado

### Requirement: Lista de participantes na página do torneio
Em torneios AVULSOS a lista de participantes permanece. Em torneios COMPETITIVOS a página SHALL exibir a lista de VAGAS: clube (escudo+nome), técnico atual ou "vaga aberta", e — para o dono — o convite da vaga (copiar/regenerar) e a ação de expulsar; para o técnico, a ação de desistir.

#### Scenario: Painel de vagas do dono
- **WHEN** o dono abre seu torneio competitivo
- **THEN** vê cada clube com técnico/vaga aberta, link de convite por clube e ações

### Requirement: Apresentação do convite público

A página pública de convite (`/convite/[codigo]`) SHALL ser apresentada com a
moldura de atmosfera da marca (fundo de estádio + marca Goliseu), e o convite de
VAGA SHALL destacar o ESCUDO do clube como elemento central (com o nome do clube e
o torneio). Os demais estados (aceite avulso, atalhos, bloqueios, deslogado,
código inválido) SHALL usar um herói visual consistente (ícone temático ou escudo)
acima da mensagem. A apresentação NÃO SHALL alterar a lógica de convite (RPCs,
precedência vaga→avulso, estados permitidos) nem os textos e papéis acessíveis
(`status`/`alert`, rótulos de botões e links).

#### Scenario: Convite de vaga destaca o clube

- **WHEN** um convite de VAGA válido é aberto por um usuário logado
- **THEN** o escudo do clube aparece em destaque, com o nome do clube e o torneio,
  acima do botão de assumir o clube

#### Scenario: Apresentação não altera comportamento

- **WHEN** qualquer estado do convite é renderizado (aceite, atalho, bloqueio,
  deslogado, inválido)
- **THEN** os mesmos textos, papéis acessíveis e ações de antes permanecem, apenas
  com a nova moldura e herói visual

