# league-format Specification

## Purpose
TBD - created by archiving change add-league-format. Update Purpose after archive.
## Requirements
### Requirement: Motor puro de geração de tabela round-robin
O sistema SHALL prover um motor PURO `gerarTabelaLiga` (zero IO, mesmo padrão
do `computeStandings`) que, dado um conjunto ordenado de participantes e a
opção ida-e-volta, devolve as rodadas com seus confrontos pelo método do
círculo: todos jogam contra todos exatamente uma vez por turno, nenhum
participante joga duas vezes na mesma rodada. Com N par, SHALL gerar N-1
rodadas por turno com N/2 jogos; com N ímpar, N rodadas por turno e um
participante de folga por rodada (sem partida "bye" persistida). Com
ida-e-volta, o segundo turno SHALL espelhar o primeiro com os lados invertidos
e numeração de rodada contínua. O resultado SHALL ser determinístico para a
mesma entrada (a ordenação dos participantes é responsabilidade do chamador,
por code-point do id).

#### Scenario: N par gera N-1 rodadas completas
- **WHEN** o motor recebe 4 participantes em ida simples
- **THEN** devolve 3 rodadas com 2 confrontos cada, cobrindo as 6 combinações sem repetição e sem participante duplicado na mesma rodada

#### Scenario: N ímpar gera folga
- **WHEN** o motor recebe 5 participantes em ida simples
- **THEN** devolve 5 rodadas com 2 confrontos cada (10 combinações) e em cada rodada exatamente um participante sem jogo

#### Scenario: Ida-e-volta espelha com lados invertidos
- **WHEN** o motor recebe os mesmos participantes com ida-e-volta
- **THEN** o segundo turno repete os confrontos do primeiro com `participante_1`/`participante_2` trocados e rodadas numeradas em sequência contínua

#### Scenario: Determinismo
- **WHEN** o motor é chamado duas vezes com a mesma entrada
- **THEN** devolve exatamente as mesmas rodadas e confrontos na mesma ordem

### Requirement: Iniciar torneio de liga
O início da liga SHALL operar sobre as VAGAS do torneio: o motor recebe os slot ids (ordenados por code-point), as partidas nascem com vaga_1/vaga_2 e a promoção de status segue o padrão atual (INSERT lote + idempotência + barreira por índice de par de vagas). Iniciar SHALL exigir ao menos 2 vagas e NÃO SHALL exigir técnicos presentes.

#### Scenario: Liga inicia sem nenhum técnico
- **WHEN** o dono inicia uma liga com 4 clubes e nenhum técnico
- **THEN** a tabela completa é gerada entre as vagas (técnicos chegam por convite depois)

#### Scenario: Partidas nascem entre vagas
- **WHEN** a tabela é gerada
- **THEN** cada partida referencia vaga_1/vaga_2 (participante_1/2 nulos)

### Requirement: Liga não aceita partida manual
Torneios com `formato = 'liga'` NÃO SHALL aceitar criação manual de partida:
a action `createMatch` SHALL rejeitar com mensagem clara, a página do torneio
NÃO SHALL exibir o atalho "Nova partida" em liga, e a rota
`/dashboard/torneios/[id]/partidas/nova` SHALL responder 404 para liga. A
policy de INSERT de `matches` SHALL espelhar a regra: em torneio liga, só
INSERT com `rodada` preenchida (caminho da geração).

#### Scenario: createMatch rejeita liga
- **WHEN** o dono de uma liga invoca `createMatch` para ela
- **THEN** a action retorna erro claro e nenhum INSERT é executado

#### Scenario: POST direto sem rodada é barrado no banco
- **WHEN** um INSERT direto em `matches` de torneio liga é tentado sem `rodada`
- **THEN** a política RLS rejeita a operação

#### Scenario: UI não oferece partida manual em liga
- **WHEN** o dono abre a página de uma liga
- **THEN** o atalho "Nova partida" não aparece e a rota do formulário responde 404

### Requirement: Painel de início na página do torneio
A página do torneio SHALL exibir ao DONO de liga em `rascunho` um painel
"Iniciar torneio" com a contagem de participantes confirmados e a prévia de
partidas e rodadas a gerar (calculada pelo MESMO motor — fonte única), além do
botão de iniciar. Com menos de 2 participantes o botão SHALL ficar
desabilitado com orientação para convidar. O painel NÃO SHALL aparecer para
não-donos, para torneios avulsos, nem após o início.

#### Scenario: Dono vê o painel com prévia
- **WHEN** o dono abre a página da própria liga em rascunho com 4 participantes (ida-e-volta)
- **THEN** o painel informa 4 participantes, 12 partidas em 6 rodadas, e o botão de iniciar habilitado

#### Scenario: Participantes insuficientes orientam a convidar
- **WHEN** a liga em rascunho tem menos de 2 participantes
- **THEN** o painel orienta a usar o link de convite e o botão fica desabilitado

#### Scenario: Painel some após iniciar
- **WHEN** a liga passa a `ativo`
- **THEN** o painel não é renderizado e as partidas geradas aparecem nas listas

### Requirement: Integridade da rodada
A coluna `matches.rodada` SHALL ser anulável (`null` = partida avulsa) com
CHECK `rodada >= 1` quando presente. A `rodada` SHALL ser imutável via
anon/authenticated (entra no trigger `lock_match_relations`, junto de
participantes e torneio); `service_role` permanece isento.

#### Scenario: Rodada inválida é rejeitada
- **WHEN** uma escrita tenta gravar `rodada = 0` ou negativa
- **THEN** a CHECK rejeita a operação

#### Scenario: Renumerar rodada por POST direto é barrado
- **WHEN** um UPDATE via anon/authenticated tenta alterar `rodada`
- **THEN** o trigger bloqueia a operação

### Requirement: Rótulo de UI do formato pontos corridos

O sistema SHALL exibir o formato de torneio `liga` com o rótulo **"Pontos
corridos"** em toda a UI que NOMEIA o formato — o `label` de `FORMATO_META`
(cards, cabeçalho, seletor de criação) E o `formatoLabel` do painel "Iniciar
torneio" (literal, não vindo de `FORMATO_META`). Onde o texto apenas se refere ao
torneio em andamento (mensagens de limite de clubes, toast de início, empty
states de criação), o wording SHALL ser NEUTRO ("torneio" / "pontos corridos"),
sem a palavra ambígua "liga". A descrição curta do formato SHALL permanecer
"Todos contra todos, com tabela". O VALOR DE DOMÍNIO SHALL permanecer `'liga'`:
o enum do banco, o tipo `TournamentFormat`, a opção `'liga'` do `z.enum` do
schema de torneio (cujo `default` continua `'avulso'`) e a CHAVE de
`FORMATO_META` NÃO SHALL mudar. A troca é puramente de texto exibido: nenhum dado
persistido, contrato de action ou validação é afetado.

#### Scenario: Card e cabeçalho exibem "Pontos corridos"

- **WHEN** um torneio de formato `liga` é criado e sua página/card é renderizada
- **THEN** o rótulo mostrado é "Pontos corridos" (não "Liga"), com a descrição
  "Todos contra todos, com tabela"

#### Scenario: Painel "Iniciar torneio" e mensagens sem "liga" ambígua

- **WHEN** o dono abre um torneio de pontos corridos em rascunho (painel de
  início), atinge o limite de clubes, ou lê os empty states de criação/partida
- **THEN** o painel rotula o formato como "Pontos corridos" e as mensagens usam
  wording neutro ("O torneio aceita no máximo…", "É preciso pelo menos 2 clubes.",
  "Torneio iniciado! Tabela gerada."), sem a palavra "liga"

#### Scenario: Valor de domínio permanece `'liga'`

- **WHEN** o criador seleciona o card "Pontos corridos" no formulário de criação
- **THEN** o valor submetido e persistido como `formato` continua sendo `'liga'`,
  e a validação Zod (`z.enum`, `default` `'avulso'`) aceita o mesmo valor de sempre

