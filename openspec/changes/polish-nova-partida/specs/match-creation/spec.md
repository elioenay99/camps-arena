# match-creation — Delta Spec

## ADDED Requirements

### Requirement: Apresentação da criação de partida avulsa

As telas de criação de partida avulsa (seletor de torneio e formulário) SHALL ser
apresentadas com o idioma visual da marca: cabeçalho com ícone de confronto e
título em tipografia de display, e o formulário SHALL apresentar os dois lados como
um confronto (um divisor central entre os participantes). A apresentação SHALL ser
operável no viewport de celular (390px) e NÃO SHALL alterar a action de criação, os
nomes dos campos (participante 1/2), a opção "Definir depois" nem os gates de
propriedade/formato.

#### Scenario: Formulário com cara de confronto

- **WHEN** o dono abre o formulário de nova partida de um torneio avulso
- **THEN** os dois selects de participante aparecem separados por um divisor de
  confronto, com o cabeçalho em tipografia de display e ícone

#### Scenario: Apresentação não altera comportamento

- **WHEN** o usuário escolhe os participantes (ou deixa a definir) e cria a partida
- **THEN** o comportamento (action, nomes de campo, opção "Definir depois", gates)
  permanece como antes, apenas com a nova moldura visual
