## Contexto

Duas mudanças independentes viajam juntas porque colidem no mesmo eixo: a **borda inferior
da viewport no mobile**. A Parte A instala uma barra fixa lá; o item 4 da Parte B quer
ancorar a barra do wizard lá; e o `<Toaster>` já mora lá desde o lote 1. Tratar as três
separadamente produziria três camadas empilhadas disputando o mesmo espaço.

## Decisão 1 — a altura da barra é um contrato publicado, não uma constante replicada

Três consumidores precisam saber quanto a barra ocupa: o conteúdo do dashboard (respiro no
fim da página), a barra do wizard (ancoragem acima) e o toast (deslocamento). Replicar
`3.25rem + env(safe-area-inset-bottom)` em três lugares garante que um deles fique para trás
no próximo ajuste.

São **duas** custom properties em `:root` (`globals.css`), não uma — e a razão é uma
sutileza que só aparece ao ler o `@layer base` existente:

```css
--nav-inferior-faixa: 3.25rem;                                        /* faixa tocável */
--nav-inferior-h: calc(var(--nav-inferior-faixa) + env(safe-area-inset-bottom));
```

52px de faixa tocável (ícone 20px + rótulo 10px + padding) — acima do piso de 44px de alvo
de toque do lote 1 — mais a área segura, que resolve de verdade porque o lote 1 ligou
`viewportFit: "cover"`.

**Por que duas.** O `body` já declara `padding-bottom: env(safe-area-inset-bottom)` (change
`mobile-alvos-toque-safe-area`, barra de gestos do Android). Elementos `fixed`/`sticky` se
posicionam pela **viewport**, ignorando esse padding; o conteúdo em fluxo, não — ele já foi
empurrado para cima pelo inset.

Logo os consumidores leem vars diferentes, e trocá-las produz um erro silencioso de um inset
(~34px de faixa vazia no iPhone, ou 34px de conteúdo sob a barra):

| Consumidor | Posicionamento | Var correta |
|---|---|---|
| Respiro do conteúdo do dashboard | fluxo (o `body` já pagou o inset) | `--nav-inferior-faixa` |
| Barra de ação do wizard | `sticky`, mede da viewport | `--nav-inferior-h` |
| Toast (sonner) | `fixed`, mede da viewport | `--nav-inferior-h` |

A var existe em TODAS as rotas, inclusive onde a barra não é renderizada. Isso é
intencional: ela descreve "o quanto a barra ocuparia", e quem a consome já é condicional
(`sm:pb-0` no conteúdo, `:has()` no toast). Uma var condicional exigiria JS ou um
`<style>` por rota.

## Decisão 2 — o CONFLITO toast × barra inferior

### O que quebrou

`src/app/layout.tsx` carrega, em comentário, a premissa que autorizou o `bottom-center`:

> Ancorado embaixo: no topo o toast cobria o header inteiro (marca, menu, tema, conta) no
> mobile. **Nenhuma tela tem barra de ação fixa no rodapé**, então não há disputa de espaço.

A Parte A invalida a segunda frase para toda a subárvore `/dashboard`. Sem tratamento o
toast não apenas encosta na barra: ele a **cobre**, porque o container do sonner é
`position: fixed` com `z-index: 999999999` — nenhum `z-index` sensato na barra vence isso.
E a barra é o alvo de toque da navegação: um toast de 4 segundos sequestraria a navegação
inteira por 4 segundos, exatamente depois de uma ação (que é quando o usuário quer navegar).

Voltar o toast para o topo não é opção: o lote 1 mediu que lá ele cobre o header inteiro.
Esse defeito é pior — o header carrega marca, menu, tema e conta.

### Alternativas avaliadas

**(a) `mobileOffset={{ bottom: ... }}` global no `<Toaster>`.** Sonner v2 aceita a prop e
ela é a resposta idiomática. Descartada por dois motivos:

- **Escopo errado.** A prop é global. A landing e `/demo` — que **não** têm barra inferior —
  passariam a exibir toasts flutuando 60px acima da borda, sem nada embaixo. Estética
  quebrada em duas superfícies públicas para resolver um problema da subárvore privada.
- **Breakpoint errado.** O `mobileOffset` do sonner vale sob `max-width: 600px`
  (`node_modules/sonner/dist/styles.css`). Nossa barra é `sm:hidden`, ou seja, visível até
  639px. A faixa 601–639px ficaria com a barra visível e o toast em cima dela — o bug
  original, só que num intervalo estreito e por isso mais difícil de flagrar.

**(b) Mover o `<Toaster>` para o layout do dashboard.** Daria escopo perfeito, mas
duplicaria o Toaster (landing e demo também emitem toasts) e criaria dois containers do
sonner no DOM em transições de rota. Descartada.

**(c) Renderizar a barra fora do fluxo do toast** (ex.: `z-index` maior). Perde para
`999999999` e viraria uma guerra de z-index. Descartada.

### Decisão adotada — deslocamento por CSS escopado ao DOM que tem a barra

A barra recebe `id="nav-inferior"`. Em `globals.css`, uma regra escopada por `:has()` levanta
o toast **apenas quando a barra está no documento** e **apenas no mobile**:

```css
@media (width < 40rem) {
  body:has(#nav-inferior) [data-sonner-toaster][data-y-position="bottom"] {
    --offset-bottom: calc(var(--nav-inferior-h) + 0.5rem) !important;
    --mobile-offset-bottom: calc(var(--nav-inferior-h) + 0.5rem) !important;
  }
}
```

Por que satisfaz as duas restrições que derrubaram a alternativa (a):

- **Escopo.** `body:has(#nav-inferior)` só casa quando o layout do dashboard está montado.
  Landing e `/demo` seguem com o toast rente à borda, exatamente como hoje.
- **Breakpoint.** A media query é a NOSSA (`40rem` = `sm`), não a do sonner. As duas
  variáveis são sobrescritas de uma vez porque o sonner usa `--offset-bottom` acima de 600px
  e `--mobile-offset-bottom` abaixo; cobrindo as duas, a faixa 601–639px fica correta.

O `!important` é necessário e deliberado: o sonner escreve as duas vars como **estilo
inline** no container, e estilo inline vence qualquer folha de estilo. É o único ponto do
projeto onde ele se justifica, e o comentário no CSS registra o porquê.

Invariante que a change instala: **o toast nunca cobre a navegação, e a navegação nunca
cobre o toast** — o deslocamento é a altura da barra mais uma folga de 8px.

O comentário em `src/app/layout.tsx` é reescrito. Deixá-lo afirmando "nenhuma tela tem barra
de ação fixa no rodapé" seria manter em produção uma justificativa que a própria change
tornou falsa — e é exatamente o tipo de comentário que o próximo leitor usaria para tomar a
decisão errada.

## Decisão 3 — a barra não recebe os destinos por prop

`dashboard/layout.tsx` é RSC e já mantém a lista `LINKS` do hambúrguer. O caminho óbvio seria
passar os quatro destinos da barra como prop a partir dela — um só lugar de verdade.

Não passamos. Os destinos da barra carregam um **ícone**, e a barra é client component:
passar componentes de ícone através da fronteira RSC é a classe de bug que já custou uma
change inteira neste projeto (`fix-editar-placar-rsc`: um `<Button>` client atravessou a
fronteira como prop e chegou com `isValidElement === false`, sumindo sem erro).

A barra declara a própria lista, internamente. É duplicação real e conhecida — quatro
`href` que também aparecem em `LINKS` — e o preço é aceito em troca de não reencostar
naquela fronteira. Um teste afirma que os quatro `href` da barra apontam para rotas reais.

## Decisão 4 — a barra e o wizard não se sobrepõem: o wizard ancora ACIMA da barra

`/dashboard/ligas/nova` e `/dashboard/copas/nova` vivem na subárvore autenticada: a barra
inferior está presente. A barra `Anterior / Próximo` do wizard, ao virar `sticky bottom-0`,
ficaria exatamente sob a navegação.

Duas saídas: suprimir a navegação no wizard, ou empilhar. **Empilhamos**, porque suprimir a
navegação numa tela de formulário longo é justamente onde a fuga ("me tira daqui") é mais
provável — e porque suprimir exigiria estado compartilhado entre um client component e o
layout RSC.

A barra do wizard ancora em `sticky bottom-[var(--nav-inferior-h)] sm:static`, ou seja,
imediatamente acima da navegação, lendo o mesmo contrato da Decisão 1. Ela ganha fundo
opaco (`bg-background`) porque `sticky` sobre conteúdo rolante sem fundo deixa o texto
passar por baixo.

Nenhum `pb-[env(safe-area-inset-bottom)]` na barra do wizard: quem paga a área segura é a
navegação, que está por baixo. Somar o inset duas vezes abriria uma faixa vazia.

## Decisão 5 — recolher, nunca remover

Três itens da Parte B escondem informação (URL do convite, console de moderação, aviso da
demo). Em todos, a regra é a mesma: **recolher atrás de um `<details>` nativo ou de um
breakpoint, nunca remover**.

- A URL do convite é redundante com `CopyVagaLinkButton`, mas é a única forma de conferir
  o link a olho antes de mandar — vai para `<details>`, não para o lixo.
- O console de moderação recolhe fechado por padrão. Um moderador com 20 clubes paga um
  toque a mais por clube que for moderar, e economiza ~11 telas de rolagem em todos os
  outros. A troca é favorável porque moderar é pontual e rolar é constante.
- O aviso da demo **encurta** ("Dados fictícios" abaixo de `sm:`), nunca some. A frase
  completa reaparece em `sm:`. Transparência de que os dados são fictícios é obrigação da
  demo, não item de densidade — e é por isso que ela é o único texto desta change que não
  pode ser recolhido atrás de um disclosure.

`<details>` nativo, e não um disclosure em React, mantém `VagasSection` como RSC puro.

## Decisão 6 — o CTA quebra em vez de truncar

`buttonVariants` declara `whitespace-nowrap shrink-0` na base. Não mexemos na base: ela está
certa para a esmagadora maioria dos botões (rótulos curtos, onde quebrar seria pior).

O CTA longo desfaz as duas localmente: `h-auto min-h-11 max-w-full whitespace-normal`.
`h-auto` é obrigatório junto de `whitespace-normal` — sem ele o `h-11` da variante `default`
corta a segunda linha, trocando um defeito por outro. `min-h-11` preserva o piso de toque do
lote 1.

Preferimos quebrar a encurtar o rótulo no mobile: "leva 1 minuto" é a redução de atrito que
faz o CTA converter, e é a metade que seria cortada.

## Decisão 7 — o teto da vitrine é defensivo, não uma feature

`.limit(60)` nas duas queries de `getVitrine`. Sem `ORDER BY` explícito no fetcher, o teto
não tem semântica de "as 60 melhores" — tem semântica de "o payload não cresce sem limite".
É proteção contra uma vitrine que hoje tem dezenas de itens e amanhã tem milhares.

Paginação e busca ficam fora: instalar um teto sem UI de navegação é aceitável enquanto o
volume real está muito abaixo dele; instalar meia-feature de busca não é.

## Riscos

| Risco | Mitigação |
|---|---|
| `:has()` não suportado | Baseline desde 2023 em todos os navegadores-alvo; a degradação é o comportamento de hoje (toast sobre a barra), não uma quebra de layout |
| Barra cobre o fim das listas longas | `pb-[var(--nav-inferior-h)] sm:pb-0` no wrapper do conteúdo do dashboard |
| `<details>` no console de moderação esconde ação urgente | O console já era condicional a `podeModerar`; o `<summary>` nomeia o que há dentro ("Gerenciar vaga") |
| Teste de isolamento da demo quebra ao tocar `DemoRibbon` | A mudança é só de texto/classes, sem import novo; o teste de grafo type-aware roda no gate |
| Barra inferior aparecer na landing/demo | Renderizada exclusivamente em `dashboard/layout.tsx`; teste afirma a ausência |
