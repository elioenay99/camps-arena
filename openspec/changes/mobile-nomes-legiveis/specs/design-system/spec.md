## ADDED Requirements

### Requirement: Identidade legível em linha horizontal densa no mobile

O nome de uma entidade SHALL permanecer legível em 390px de viewport quando exibido numa
linha que também carrega um cluster de badges, pílulas de status ou botões — seja o nome de
competidor, clube, técnico, membro de equipe ou competição.

Um cluster de badges/pílulas/botões SHALL NOT ser declarado `shrink-0` na mesma linha
flex de uma identidade que trunca: isso transfere todo o déficit de espaço para o nome. O
cluster SHALL ou sair da linha da identidade no mobile (segunda faixa, com
`flex-col` revertido em `sm:`/`md:`), ou ser recolhido num disclosure NATIVO
(`<details>`/`<summary>`), ou passar a poder quebrar (`flex-wrap`).

Todo filho de flex que trunca SHALL declarar `min-w-0`; toda coluna de grid que precisa
encolher SHALL usar `minmax(0,1fr)` em vez de `1fr` (que tem `min-width:auto` e não
encolhe).

Quando a identidade tem uma linha SECUNDÁRIA que a desambigua — o autor de uma competição
(`por Fulano`), a origem de uma vaga derivada, o total de jogos que dá sentido a um
agregado — essa linha secundária SHALL sobreviver legível em 390px, não sendo aceitável
que ela seja o elemento sacrificado.

O layout de desktop SHALL permanecer o atual: toda a acomodação é mobile-first e revertida
em `sm:`/`md:`.

#### Scenario: Cluster largo ao lado de um nome em 390px

- **WHEN** uma linha exibe um nome truncável e um cluster de pílulas/botões com mais de
  ~80px de largura fixa, em 390px de viewport
- **THEN** o cluster ocupa uma faixa própria (ou é recolhido) e o nome dispõe da largura
  útil da linha, em vez de ser reduzido a poucos caracteres

#### Scenario: Desktop preservado

- **WHEN** a mesma superfície é exibida em `sm:` ou acima
- **THEN** identidade e cluster voltam à mesma linha, com o layout anterior à mudança

#### Scenario: Linha secundária desambiguadora sobrevive

- **WHEN** a superfície tem competições ou competidores homônimos, distinguíveis apenas
  pela linha secundária (autor, origem da vaga, total de jogos)
- **THEN** essa linha secundária é legível em 390px

### Requirement: Separação entre controles de ação oposta empilhados

Controles de ação OPOSTA e imediata SHALL ter separação visual e de toque no mobile (`gap`
maior que zero entre os alvos) quando empilhados ou adjacentes — subir/descer,
aprovar/rejeitar, somar/subtrair — de modo que a fronteira entre eles não seja uma linha de
tolerância nula sob um polegar (~34-45px de área de contato).

Essa separação SHALL ser mobile-first e PODE ser removida em `md:` para preservar a
compactação do desktop, onde o ponteiro é preciso.

Este requirement é independente do piso de 44px de alvo de toque: um par pode legitimamente
ficar abaixo de 44px por restrição de altura de lista e ainda assim SHALL ter separação.

#### Scenario: Setas de reordenação de desempate

- **WHEN** o par subir/descer de reordenação de empate é exibido no mobile
- **THEN** há espaço real entre os dois alvos, e um toque na borda inferior de "subir" não
  dispara "descer"

### Requirement: Informação essencial não vive apenas em tooltip nativo

Um elemento cuja informação só é obtida por `title="..."` SHALL oferecer, no mobile, um
caminho tocável equivalente — texto visível, `<details>` nativo, ou o padrão de dica já
adotado pelo projeto. Tooltip nativo não abre em toque: em dispositivo tátil a informação
simplesmente não existe.

O atributo `title` PODE ser preservado para o desktop; o que este requirement proíbe é ele
ser o ÚNICO portador da informação.

#### Scenario: Chip de motivo num dispositivo tátil

- **WHEN** um chip indica o motivo de uma decisão (Playoff, Sorteio, Ajuste) e o
  significado está em `title`
- **THEN** no mobile o significado também aparece por um caminho tocável ou em texto
  visível, sem depender de hover
