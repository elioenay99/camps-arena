# tournament-management — Delta Spec

## ADDED Requirements

### Requirement: Formulário de criação adaptativo

O formulário de criação de torneio SHALL apresentar o FORMATO como cards
selecionáveis (ícone + nome + descrição curta), e SHALL revelar progressivamente
apenas os campos relevantes ao formato escolhido: o passo de Clubes e as opções
(ida e volta, 3º lugar) só nos formatos competitivos/com chave, e os "Pontos por
resultado" SOMENTE em formatos com tabela (liga, grupos + mata-mata, fase de
liga). O formato avulso SHALL exigir o mínimo (título, formato, visibilidade). A
apresentação SHALL preservar o contrato de submissão atual (a action
`createTournament` recebe os mesmos campos; campos não exibidos assumem os
defaults do schema).

#### Scenario: Avulso mostra o mínimo

- **WHEN** o criador seleciona o formato avulso
- **THEN** o formulário exibe só título, seletor de formato e visibilidade — sem
  clubes nem pontos por resultado

#### Scenario: Pontos só onde há tabela

- **WHEN** o criador seleciona mata-mata
- **THEN** aparecem clubes, ida e volta e 3º lugar, mas NÃO "Pontos por resultado"
  (que surge em liga, grupos + mata-mata e fase de liga)

#### Scenario: Formato em cards seleciona o valor

- **WHEN** o criador clica no card de um formato
- **THEN** o card fica destacado e o valor é submetido como `formato` (radio),
  preservando a semântica de grupo e o foco por teclado
