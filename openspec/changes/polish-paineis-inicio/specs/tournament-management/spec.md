# tournament-management — Delta Spec

## ADDED Requirements

### Requirement: Apresentação dos painéis de início do torneio

Os painéis "Iniciar torneio" dos formatos gerados SHALL ser apresentados numa
moldura de card consistente com a criação e o cabeçalho do torneio: ícone do
formato, título em destaque, indicação de rascunho e a prévia da geração realçada.
As opções de chaveamento/distribuição
(sorteio, sorteio com potes, montagem manual) SHALL ser apresentadas como cartões
selecionáveis (ícone + descrição), e as configurações adicionais reveladas
(cabeças de chave, grupo por clube, confrontos) SHALL aparecer com transição suave
e alvos de toque adequados ao uso em celular. A apresentação NÃO SHALL alterar a
prévia (mesmo motor da geração), os nomes dos campos enviados às actions, os gates
de quantidade/configuração nem os papéis acessíveis (`status`/`alert`, rótulos dos
controles).

#### Scenario: Painel de início com moldura e prévia realçada

- **WHEN** o dono abre um torneio de formato gerado em rascunho
- **THEN** o painel mostra o ícone do formato, o título "Iniciar torneio", a
  indicação de rascunho e a prévia do que será gerado em destaque

#### Scenario: Modos de chaveamento como cartões selecionáveis

- **WHEN** um painel oferece mais de um modo (sorteio, potes, manual)
- **THEN** cada modo aparece como um cartão selecionável com ícone e descrição, e
  selecionar um modo revela suas configurações com transição suave

#### Scenario: Apresentação não altera comportamento

- **WHEN** qualquer painel de início é renderizado (prévia, gates, disclosure)
- **THEN** a prévia, os nomes de campo enviados à action, os gates e os papéis
  acessíveis permanecem como antes, apenas com a nova moldura e os cartões
