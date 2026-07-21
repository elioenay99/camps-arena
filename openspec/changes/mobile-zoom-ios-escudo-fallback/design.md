## Contexto

Duas frentes independentes num mesmo lote porque as duas são de apresentação, as duas
saíram da mesma sessão de validação mobile e nenhuma toca regra de negócio.

## Decisão 1 — piso de 16px em campo editável, via primitivo

### O mecanismo

O Safari/iOS amplia a viewport ao focar um campo editável cuja `font-size` **computada** é
< 16px. Duas propriedades tornam isso pior do que parece:

1. **O zoom não se desfaz** ao sair do campo. Ele fica.
2. **Na PWA instalada não há barra de endereço** para reancorar a escala — o usuário precisa
   dar pinch manualmente.

Não dá para desligar isso por `viewport` sem estragar acessibilidade:
`maximum-scale=1`/`user-scalable=no` matam o zoom por pinch do usuário, que é recurso de
acessibilidade e é ignorado pelo iOS moderno de qualquer forma. **A única correção legítima
é a fonte ser ≥ 16px no mobile.**

### Por que um componente, e não um `find`/`replace`

As classes dos `<select>` estão copiadas em 12 arquivos, com 5 alturas diferentes (`h-7`,
`h-8`, `h-9`, `h-10`, `h-11`) e dois raios (`rounded-md`, `rounded-lg`). Corrigir string por
string conserta hoje e regride no próximo select que alguém escrever. O `Input` já provou o
padrão: a regra mora no primitivo, a chamada herda.

`SelectNative` espelha o `Input` deliberadamente — mesmo `h-11 md:h-8`, mesmo `text-base
md:text-sm`, mesmo `rounded-lg`, mesmos anéis de foco. Um formulário que mistura `Input` e
`SelectNative` fica alinhado sem ajuste por chamada.

### Por que continua `<select>` nativo

Tentação óbvia: trocar por um `Select` do Radix e resolver estilo junto. Recusado.
O `<select>` nativo abre a roleta do SO no mobile (melhor com muitas opções, ex. "Ir para a
rodada" com 38 rodadas), é acessível por teclado sem código, não carrega JS e não tem
armadilha de portal dentro de `Dialog`. O defeito aqui é de **fonte**, não de elemento.

### Preservação do desktop

A regra 2 da proposal ("o desktop não muda") entra em tensão com a unificação: nem toda
chamada tinha `md:h-8`. Resolução: o `SelectNative` traz o padrão do design system, e as
chamadas cuja altura de desktop diverge passam um override explícito —
`className="md:h-9"` (grupos, mata-mata, copa, demo), `md:h-10` (confronto direto). O
`tailwind-merge` do `cn()` resolve o conflito a favor do override.

Isso deixa a divergência **visível e datada** em vez de escondida numa string copiada: quem
quiser unificar a densidade de desktop depois é só apagar os overrides, numa change própria
com validação visual de desktop.

### Onde a regra NÃO se aplica

Só campo editável focado dispara o zoom. Ficam de fora, deliberadamente:

- **Botões, rótulos, badges, `<option>`** — não recebem digitação.
- **`<input type="color">`** (`color-field.tsx:54`) — abre o picker do SO, não aceita
  digitação. O campo HEX ao lado, esse sim, é corrigido.
- **`text-xs` de texto corrido** (descrições, mensagens de erro) — não é campo.

### Os três campos que ficam fora do componente

| Campo | Por que não migra | O que muda |
|---|---|---|
| `RoundPager.tsx:73` | `appearance-none` + `ChevronDown` absoluto + `pr-8` + `min-h-11` (sem `h` fixa) — a geometria é a razão de existir do componente | só `text-sm` → `text-base md:text-sm` |
| `DemoPerfilSelector.tsx:26` | vive na faixa fina da demonstração, borda âmbar própria, `h-7` | `text-xs` → `text-base md:text-xs`; `h-7` → `h-9 md:h-7` (28px não contém 16px) |
| `PropostasPendentes.tsx:129` | é `<textarea>`, não `<select>` | só `text-sm` → `text-base md:text-sm` |

O `DemoPerfilSelector` cresce 8px no mobile dentro de uma faixa sticky — é o único ponto do
lote com risco de aperto vertical fora de um formulário. Registrado aqui para a validação
visual olhar.

## Decisão 2 — fallback do escudo: o que foi refutado e o que sobrou

### A hipótese, e por que ela caiu

A suspeita levantada era o modo de falha clássico de imagem com fallback em SSR: o `<img>`
chega no HTML do servidor, o browser tenta carregar e falha **antes** do React hidratar, o
evento `error` se perde (React não replica `error` de imagem no replay de eventos) e o
`onError` nunca roda — fica o ícone de quebrado, permanente.

O mecanismo é real **em `<img>` cru**. Não se aplica aqui: o `TeamCrest` usa `next/image`, e
o `next/image` instalado (16.2.6) já implementa a mitigação, no ref callback do
`ImageElement` — `node_modules/next/dist/client/image-component.js:140-145`:

```js
if (onError) {
  // If the image has an error before react hydrates, then the error is lost.
  // The workaround is to wait until the image is mounted which is after hydration,
  // then we set the src again to trigger the error handler (if there was an error).
  img.src = img.src
}
```

Reatribuir `img.src` reexecuta o algoritmo de "update the image data" do HTML. Para uma
requisição em estado *broken* não há o early-abort de imagem já disponível, então há novo
fetch, nova falha e novo evento `error` — agora com o React já hidratado e o handler
armado.

Confirmado que o handler chega lá: `getImgProps` mantém `onError` no `...rest`
(`get-img-props.js:148`, `:567`), o `ImageElement` desestrutura e reencaminha
(`image-component.js:135`, `:203-205`). Cadeia intacta.

**Veredito: hipótese REFUTADA.** Ela não explica o print do dono.

### O que sobrou

**(a) Defeito provado — `erro` fica preso na troca de `escudoUrl`.**
`erro` é `useState(false)` sem nenhum reset. Um `TeamCrest` que falhou nunca mais tenta,
mesmo recebendo URL nova. Hoje isso está *documentado como aceito* por
`TeamCrest.test.tsx:74-84` ("estado preso").

Não é teórico. O `RoundPager` troca de rodada **no lugar** — mesma árvore, props novas — e o
React reaproveita as instâncias. Um escudo que falhou na rodada 8 continua nas iniciais na
rodada 9, com URL perfeita. Ironicamente esse defeito degrada para o lado *seguro*
(iniciais), então não é o do print — mas é errado e o teste que o abençoa precisa ser
invertido.

Correção: derivar o reset da mudança de prop, sem `useEffect` — guardar a URL que produziu o
erro e comparar durante o render (padrão "adjusting state on prop change" do React), o que
evita o flash de um render intermediário com o estado velho.

**(b) Risco residual — a URL pode estar quebrada no Storage.**
Segue plausível e **não excludente**: o objeto daquele clube pode não existir no bucket, ou o
host pode estar fora do `remotePatterns` do `next.config.ts:88-103` (só
`media.api-sports.io/football/teams/**` e o Storage público do projeto). Confirmar exige
consultar banco/Storage, o que esta change não pode fazer — **roteado ao orquestrador**.

Vale notar que nem esse caminho explicaria o ícone quebrado *com o fallback funcionando*:
URL fora do `remotePatterns` faz o `getImgProps` lançar no render, e objeto inexistente faz o
otimizador responder 400 → `error` → fallback. Ou seja: qualquer que seja a URL, o esperado
era iniciais. O print diz que não foi isso que aconteceu, e nenhuma das duas explicações
fecha sozinha.

### Por que a defesa em profundidade entra mesmo com a hipótese refutada

O checador de mount (`img.complete && img.naturalWidth === 0` → estado de erro) é a leitura
**direta do estado terminal do elemento**, em vez de depender de um evento ter sido
disparado, ouvido e não perdido. Custa um `ref` e nenhum render extra no caminho feliz
(imagem boa tem `naturalWidth > 0`).

Ele cobre, sem precisar saber qual delas é a verdadeira: mitigação do `next/image` que não
refaz o fetch por decisão de cache; resposta de erro servida pelo service worker; e
regressão futura se o `next/image` mudar de estratégia. Dado que o defeito está **observado
em produção** e a explicação mais provável acabou de ser refutada, guarda redundante é a
escolha certa.

`complete && naturalWidth === 0` só é verdade para imagem que **terminou** e **falhou**:
imagem ainda carregando tem `complete === false`; imagem boa tem `naturalWidth > 0`. Sem
falso positivo.

## Alternativas descartadas

| Alternativa | Por que não |
|---|---|
| `user-scalable=no` / `maximum-scale=1` no viewport | Mata o pinch-zoom do usuário (acessibilidade) e o iOS moderno ignora. Trata o sintoma. |
| Só trocar `text-sm` por `text-base` em cada string | Conserta hoje, regride no próximo select. Sem lugar único para o teste morar. |
| Migrar os `<select>` para Radix Select | Escopo muito maior, JS a mais, armadilha de portal em `Dialog`, e perde a roleta nativa do SO. O defeito é de fonte. |
| `unoptimized` no `TeamCrest` para fugir do otimizador | Não corrige o fallback e joga fora o redimensionamento de um asset que aparece dezenas de vezes por tela. |
| `onError` no `<img>` cru, sem `next/image` | Reintroduz exatamente o bug de pré-hidratação que o `next/image` já mitiga. |
| `useEffect` para resetar `erro` na troca de prop | Um render a mais com o estado velho (flash de iniciais no escudo certo). O ajuste durante o render não tem esse buraco. |
