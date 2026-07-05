# contextual-glossary Specification

## Purpose
TBD - created by archiving change add-glossario-ajuda-termos. Update Purpose after archive.
## Requirements
### Requirement: Ajuda contextual acessível na primeira ocorrência dos termos de nicho

A aplicação SHALL oferecer ajuda contextual, no ponto de uso, para os termos de
nicho do produto. Na PRIMEIRA ocorrência visual de cada termo, ao lado do texto
do termo, SHALL haver um gatilho de ajuda discreto (um "?") que, ao ser acionado,
abre um Popover com uma explicação de **uma frase** em pt-BR. A ajuda SHALL ser
acessível: o gatilho é um `<button>` com `aria-label` descritivo (ex.: "O que é
Pirâmide?"), o ícone é decorativo (`aria-hidden`), a ajuda abre por
**clique/toque/Enter/Espaço** e fecha por `Esc`/clique-fora (via o primitivo de
Popover), e o gatilho tem alvo de toque de pelo menos 44px de altura no mobile,
recuando à densidade compacta no desktop, com `:focus-visible` perceptível e
participação na ordem de tabulação. O componente que ancora o termo SHALL ser uma
FOLHA client (`"use client"`), preservando as páginas ancoradas como Server
Components. A copy dos termos SHALL vir de uma fonte única (catálogo), sem
duplicação entre âncoras.

Os termos cobertos SHALL incluir, cada um na sua primeira ocorrência:
**pirâmide**, **vaga**, **técnico**, **promédio**, **fase de liga**, **barragem**
e **copa imortal**. A explicação do **promédio** SHALL descrever a média de pontos
POR JOGO (não por temporada), coerente com o cálculo real da aplicação.

O gatilho de ajuda SHALL ser inserido como IRMÃO adjacente ao rótulo do termo, no
site de render real do texto — NUNCA dentro de um heading ou label cujo texto seja
nome acessível (para não alterar esse nome), e NUNCA dentro de uma estrutura de
dados compartilhada de rótulos (mapa de strings sem marcação), que espalharia o
gatilho por toda a interface. O gatilho SHALL ser HTML válido no seu contexto —
em particular, NÃO SHALL ser aninhado dentro de um `<label>` de rádio (o que
acionaria o controle e seria inválido).

#### Scenario: "?" na primeira ocorrência de cada termo

- **WHEN** um usuário encontra pela primeira vez um dos termos de nicho (pirâmide,
  vaga, técnico, promédio, fase de liga, barragem, copa imortal)
- **THEN** há, ao lado do termo, um gatilho de ajuda "?" com `aria-label`
  descritivo

#### Scenario: Ajuda abre por toque e teclado com explicação de uma frase

- **WHEN** o usuário aciona o "?" por clique, toque ou teclado (`Enter`/`Espaço`)
- **THEN** um Popover abre com a explicação de uma frase do termo, e o gatilho
  passa a expor `aria-expanded="true"`

#### Scenario: Ajuda acessível a leitor de tela e fechável por teclado

- **WHEN** um usuário de leitor de tela ou de teclado interage com o gatilho de
  ajuda
- **THEN** o gatilho é anunciado pelo `aria-label` ("O que é <termo>?"), expõe
  `aria-haspopup`/`aria-expanded`, e o Popover fecha por `Esc`

#### Scenario: Alvo de toque no mobile

- **WHEN** um usuário no mobile (390px) toca o gatilho de ajuda
- **THEN** o gatilho tem alvo de toque de pelo menos 44px de altura E largura,
  recuando à densidade compacta em `md+` (desktop)

#### Scenario: Gatilho não altera nome acessível do rótulo

- **WHEN** o gatilho de ajuda é ancorado ao lado de um heading ou label existente
  (ex.: o cabeçalho "Vagas")
- **THEN** ele é inserido como irmão adjacente, e o nome acessível do heading/label
  permanece inalterado

#### Scenario: Promédio explicado por jogo

- **WHEN** o usuário abre a ajuda do termo "promédio"
- **THEN** a explicação descreve a média de pontos POR JOGO (estilo argentino),
  coerente com o cálculo da aplicação

