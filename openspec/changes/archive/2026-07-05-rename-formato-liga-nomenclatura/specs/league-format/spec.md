# league-format — Delta Spec

## ADDED Requirements

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
