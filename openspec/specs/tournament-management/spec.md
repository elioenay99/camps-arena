# tournament-management Specification

## Purpose
TBD - created by archiving change add-tournament-ownership. Update Purpose after archive.
## Requirements
### Requirement: Criação de torneio com dono
A criação SHALL registrar created_by e visibilidade como hoje. Para formatos COMPETITIVOS, o formulário SHALL incluir a montagem dos CLUBES (mínimo 2; máximo do formato): busca de clube (API-Football/cache teams) e lista das vagas; a action SHALL criar torneio + vagas + convites por vaga (códigos únicos com retry de colisão), SEM entrada automática do dono e SEM convite genérico. Para o formato AVULSO, o fluxo atual permanece (participants + convite genérico + entrada do dono).

#### Scenario: Competitivo nasce com vagas e convites
- **WHEN** o dono cria uma liga com 4 clubes
- **THEN** nascem 4 vagas (sem técnicos) cada uma com seu link de convite

#### Scenario: Avulso preserva o fluxo antigo
- **WHEN** o dono cria um torneio avulso
- **THEN** ele entra como participante e o convite genérico é gerado como hoje

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

