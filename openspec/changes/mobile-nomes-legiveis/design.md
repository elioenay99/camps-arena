## Contexto

O defeito é sempre o mesmo desenho: um flex row com

```
[ identidade min-w-0 truncate ]  [ cluster shrink-0 largo ]
```

`min-w-0 truncate` é o que permite ao filho encolher abaixo do conteúdo — é correto e
necessário. O erro está do outro lado: o cluster é declarado `shrink-0`, então o
algoritmo de flex tira 100% do déficit de espaço do único filho que aceita encolher. Em
telas largas ninguém percebe; em 390px o nome converge para zero.

`MatchHistoryList.tsx` + `PartidaIdentidade.tsx` já resolveram isso e estão em produção.
Esta change aplica a mesma receita, não inventa outra.

## Receita (a que já foi validada)

1. **Identidade primeiro, com espaço real.** `min-w-0` no filho que trunca (obrigatório) e,
   em grid, `minmax(0,1fr)` em vez de `1fr` — `1fr` tem `min-width:auto` e NÃO encolhe
   (lição já registrada no projeto).
2. **Ações saem da linha da identidade.** Ou ganham linha própria no mobile
   (`flex flex-col gap-2 sm:flex-row sm:items-center`, com o cluster em
   `<div className="flex items-center gap-2 sm:ml-auto">`), ou vão para dentro de um
   `<details>` nativo quando forem secundárias.
3. **Nada de `shrink-0` num cluster largo.** Quando o par de botões precisa ficar inline,
   use `flex flex-wrap` + `flex-1 basis-[calc(50%-0.25rem)]` nos filhos DIRETOS — grid com
   `col-span` deixa buraco, e `DialogTrigger asChild` NÃO carrega `data-slot="button"`,
   então seletor de descendente não o alcança.
4. **Medir, não achar.** Em 390px o `<li>` útil costuma ter 280-320px depois dos paddings.

## Decisões

### D1 — Duas faixas no mobile, uma linha no desktop (padrão dominante)

Escolhido para `FluxoTemporadaPanel`, `TeamSection`, `MuralhaRanking`,
`EdicaoParticipantesPanel` e `CardVitrineDemo`.

**Alternativa descartada:** deixar o cluster encolher (`min-w-0` nele também). Pílulas e
badges truncados ("Perman…", "12 clean she…") são pior UX que uma segunda faixa: o rótulo
curto perde o sentido inteiro quando cortado, enquanto o nome próprio ainda é reconhecível
por prefixo. Além disso, botão de ação truncado tem alvo de toque instável.

**Custo aceito:** a linha fica mais alta no mobile (~2 faixas). Em `FluxoTemporadaPanel`
isso é bom: é uma lista de 8-20 itens que o dono lê com atenção, não uma lista de rolagem
infinita.

### D2 — Setas de desempate: `gap-1.5` no mobile, `gap-0` no desktop

O par empilhado subir/descer já foi levado de 28→36px na change
`mobile-alvos-toque-safe-area`, com o compromisso registrado em comentário de NÃO ir a
44px porque a coluna saltaria para 88px por linha. Esse compromisso continua válido, mas
`gap: 0` entre duas ações OPOSTAS é um defeito à parte do tamanho: a fronteira entre
"subir" e "descer" é uma linha de 0px de tolerância.

`gap-1.5` (6px) custa 6px de altura por linha e cria uma zona morta real entre os dois
alvos. Com D1 a linha já cresceu no mobile, então os 6px não mudam a contagem de itens por
tela. No desktop (`md:`) o gap volta a zero e o par permanece compacto como hoje.

**Alternativa descartada:** separar as setas em lados opostos da linha. Quebra o
`role="group"` semântico e a leitura de "controle de reordenação".

### D3 — Chips de motivo: texto visível no mobile, `title` preservado

`title` continua no elemento (útil no desktop com mouse, e é lido por alguns AT), mas
deixa de ser o ÚNICO portador da informação. No mobile o chip passa a expor o significado
em texto. Optou-se por texto visível em vez de `<details>` porque são no máximo dois chips
por linha e a explicação cabe em 3-5 palavras — um disclosure para 4 palavras é mais
fricção que informação.

### D4 — Confronto 3-up: empilha em duas linhas no mobile

`ConfrontoDiretoPanel` e `ConfrontoTecnicosPanel` são espelhos (um usa `TeamCrest`, o
outro `UserAvatar`). Recebem a MESMA solução: no mobile os dois lados ficam lado a lado
(cada um com metade real da largura, sem o centro roubando espaço) e o bloco de empates
desce para uma faixa central própria; em `sm:` volta ao 3-up de hoje.

Junto vai a correção de hierarquia: o número de empates sobe de `text-sm` para o mesmo
`text-base` dos lados. Os três números do agregado passam a ter o mesmo peso — é uma
comparação, e comparação exige escala única.

**Alternativa descartada:** fundir os dois painéis num componente compartilhado. É a
refatoração certa, mas amplia o raio de teste desta change (dois perfis diferentes, dois
fetchers) sem melhorar nenhum pixel. Fica como dívida explícita.

### D5 — `IniciarMataMataPanel`: os selects empilham no mobile

`grid-cols-[1fr_auto_1fr]` vira `grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`.
O "×" central deixa de ser uma coluna e passa a ser um separador de linha no mobile.

**Atenção travada:** a change `mobile-zoom-ios-escudo-fallback` deixou esses selects 12px
mais altos (piso de 16px de fonte, anti-zoom do iOS). Empilhar é justamente o que paga
essa altura — dois selects de 44px empilhados cabem; dois de 44px lado a lado com 87px de
largura cada é que não cabiam.

### D6 — `explorar/page.tsx`: a pílula de status sai da linha do nome

O card da vitrine tem quatro elementos disputando 390px: badge (40px), nome+legenda,
`StatusPill` (~76px) e chevron (16px). O nome e o "por Fulano" são a razão de a tela
existir. A pílula desce para junto da legenda no mobile e volta para a direita em `sm:`.

`CardVitrineDemo` recebe a solução equivalente — ele reimplementa o card de produção no
namespace demo de propósito (não refatorar produção), então os dois precisam ficar
visualmente coerentes ou a demo deixa de demonstrar o produto.

## Riscos

- **Regressão de desktop.** Mitigado por todo o comportamento novo ser mobile-first com
  reversão explícita em `sm:`/`md:`, e por os testes existentes rodarem sobre a estrutura
  do DOM (que muda) — daí a atualização dos testes irmãos ser parte da entrega, não
  consequência dela.
- **Divergência entre os painéis gêmeos.** Mitigado por D4 tratá-los na mesma passada, com
  o mesmo diff.
- **Validação visual não é feita aqui.** Restrição de recursos da máquina: sem browser,
  sem Playwright, sem suíte completa, sem `build`. As medidas desta change são aritmética
  de larguras declaradas, não screenshots. A confirmação em 390px fica com o orquestrador.
