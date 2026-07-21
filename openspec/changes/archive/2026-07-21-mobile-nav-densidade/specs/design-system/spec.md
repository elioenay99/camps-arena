## ADDED Requirements

### Requirement: Rótulo de ação nunca é clipado

O rótulo de um controle acionável SHALL permanecer legível por inteiro em 390px de viewport.
Um rótulo SHALL NOT ser cortado sem indicação — nem pela borda do container, nem por
`overflow` sem reticências.

A base de `buttonVariants` declara `whitespace-nowrap shrink-0`. Essa combinação impede
simultaneamente a quebra de linha e o truncamento gracioso: um rótulo mais largo que o
container simplesmente vaza e é cortado nos dois lados. Todo controle cujo rótulo pode
exceder a largura disponível no mobile SHALL desfazer essa combinação localmente, com
`h-auto whitespace-normal max-w-full`, permitindo a quebra em múltiplas linhas.

`h-auto` SHALL acompanhar `whitespace-normal`: as variantes de tamanho fixam altura
(`h-11`, `h-12`), e sem `h-auto` a segunda linha é cortada pela altura em vez de pela
largura.

O piso de alvo de toque de 44px SHALL ser preservado via `min-h-11`.

Este requirement vale com força máxima para o CTA primário de um estado vazio de
onboarding, onde o controle é o único caminho para o valor do produto.

#### Scenario: CTA longo na primeira tela pós-cadastro

- **WHEN** o estado vazio de quem ainda não tem torneios é exibido em 390px
- **THEN** o rótulo completo do CTA é legível, quebrando em mais de uma linha se necessário,
  sem vazar para fora do card

#### Scenario: Altura acompanha a quebra

- **WHEN** um rótulo de botão quebra em duas linhas
- **THEN** o botão cresce em altura para contê-las, em vez de cortar a segunda

### Requirement: Ação de avanço alcançável em formulário longo

Num formulário de múltiplos passos, a ação que avança para o passo seguinte SHALL estar
alcançável sem rolagem prolongada no mobile: ela SHALL ser persistente (`sticky`) na borda
inferior da área de conteúdo, em vez de ser o último elemento do documento.

A barra persistente SHALL ter fundo opaco — `sticky` sobre conteúdo rolante sem fundo deixa
o conteúdo passar por baixo dos controles.

Quando houver outra camada fixa na borda inferior, a barra de ação SHALL ancorar acima dela,
lendo a altura declarada dessa camada em vez de repetir a constante.

A persistência SHALL ser mobile-first e revertida em `sm:` (`sm:static`), preservando o
layout de desktop.

#### Scenario: Passo longo de wizard no mobile

- **WHEN** um passo do wizard empilha campos suficientes para exceder várias telas em 390px
- **THEN** a ação de avanço permanece visível na borda inferior durante toda a rolagem

#### Scenario: Desktop sem barra flutuante

- **WHEN** o mesmo wizard é exibido em `sm:` ou acima
- **THEN** a barra de ação volta ao fluxo do documento, como antes da mudança

### Requirement: Passo ativo identificado no mobile

Um indicador de progresso de múltiplos passos SHALL comunicar, no mobile, EM QUE PASSO o
usuário está — no mínimo o rótulo do passo ATIVO e sua posição na sequência
(ex.: "Passo 2 de 3 · Qualificação").

Barras de progresso puramente gráficas SHALL NOT ser a única informação disponível no
mobile: sem rótulo, o usuário vê apenas segmentos coloridos e não sabe o que está
preenchendo nem quanto falta.

Os rótulos dos passos INATIVOS PODEM permanecer ocultos no mobile por restrição de largura,
desde que o ativo esteja identificado.

#### Scenario: Wizard em 390px

- **WHEN** um wizard de múltiplos passos é exibido em 390px
- **THEN** o rótulo do passo ativo e sua posição na sequência estão visíveis em texto

### Requirement: Aviso obrigatório compacta sem desaparecer

Um aviso obrigatório SHALL permanecer visível em todas as larguras — é o caso da
transparência de que os dados de uma demonstração são fictícios. Ele PODE ser encurtado no
mobile, mas SHALL NOT ser removido, recolhido atrás de um disclosure, nem exibido apenas em
`title`.

A versão curta SHALL preservar o núcleo da informação (que os dados não são reais); a versão
completa SHALL reaparecer a partir de `sm:`.

Faixas persistentes que acompanham todas as páginas de uma subárvore SHALL ser dimensionadas
para não consumir parcela desproporcional da primeira dobra no mobile.

#### Scenario: Faixa da demonstração em 390px

- **WHEN** qualquer página de `/demo` é aberta em 390px
- **THEN** o aviso de dados fictícios está visível em forma curta, e a faixa deixa a maior
  parte da primeira dobra para o conteúdo

#### Scenario: Aviso completo no desktop

- **WHEN** a mesma página é aberta em `sm:` ou acima
- **THEN** a frase completa do aviso é exibida

### Requirement: Detalhe redundante recolhe atrás de disclosure nativo

Informação secundária redundante numa lista longa SHALL poder ser recolhida atrás de um
`<details>`/`<summary>` nativo, em vez de ocupar altura fixa em cada item — redundante aqui
significa que um controle ao lado já atende à função dela.

O recolhimento SHALL NOT remover capacidade: o controle que torna o detalhe redundante
SHALL permanecer disponível sem abrir o disclosure.

O `<summary>` SHALL nomear o que está recolhido, e o disclosure SHALL ser nativo, para que
componentes RSC não precisem virar client components.

#### Scenario: Lista de vagas de um torneio com muitos clubes

- **WHEN** quem modera abre a lista de vagas de um torneio com dezenas de clubes em 390px
- **THEN** cada vaga ocupa a altura da identidade do clube, com o detalhe do convite e as
  ações de moderação recolhidos, e a lista inteira cabe em poucas telas de rolagem

#### Scenario: Capacidade preservada

- **WHEN** o detalhe do link de convite está recolhido
- **THEN** copiar o link continua possível, e o link permanece consultável ao abrir o
  disclosure

### Requirement: Estado de sucesso oferece o próximo passo

O estado terminal de sucesso de um formulário SHALL apresentar a ação seguinte, e SHALL
preservar a moldura visual do formulário que substituiu.

Substituir um formulário inteiro por um parágrafo solto deixa o usuário sem caminho: a
mensagem confirma o que aconteceu, mas não diz o que fazer agora.

A mensagem de sucesso SHALL continuar anunciada por tecnologia assistiva (`role="status"`),
e o conteúdo dela SHALL permanecer inalterado quando a mensagem carrega semântica de
segurança (ex.: resposta idêntica exista ou não a conta, contra enumeração de usuários).

#### Scenario: Cadastro concluído

- **WHEN** o cadastro é concluído com sucesso
- **THEN** a confirmação aparece dentro da moldura do card, acompanhada de uma ação explícita
  para seguir (ir para o login)

#### Scenario: Recuperação de senha solicitada

- **WHEN** o pedido de recuperação de senha é enviado
- **THEN** a mensagem anti-enumeração permanece exatamente a mesma, agora acompanhada da
  ação de voltar ao login
