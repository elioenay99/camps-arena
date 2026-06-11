# tournament-participants — Delta Spec

## ADDED Requirements

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
