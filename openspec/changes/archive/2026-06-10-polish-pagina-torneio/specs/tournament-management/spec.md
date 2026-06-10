# tournament-management — Delta Spec

## ADDED Requirements

### Requirement: Apresentação da página do torneio

A página do torneio SHALL exibir um cabeçalho com o ícone do formato, o título e
metadados escaneáveis (status, formato, e — onde há classificação por pontos — a
pontuação V/E/D), em vez de uma linha de texto corrida. As seções (chave,
classificação, grupos, partidas, W.O., encerradas, clubes) SHALL ter títulos com
ícone consistentes, e os estados vazios SHALL ser apresentados de forma uniforme
(ícone + texto). A apresentação NÃO SHALL alterar quais seções aparecem nem os
dados/comportamento (queries, RLS, ações permanecem como hoje).

#### Scenario: Cabeçalho com formato e status

- **WHEN** um torneio é aberto
- **THEN** o cabeçalho mostra o ícone do formato, o título e o status (e a
  pontuação V/E/D apenas em formatos com tabela)

#### Scenario: Seções com estado vazio uniforme

- **WHEN** uma seção (ex.: classificação) ainda não tem conteúdo
- **THEN** ela exibe um estado vazio padronizado (ícone + texto), sem alterar
  quando a seção aparece
