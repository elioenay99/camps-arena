# Design — imagem da rodada com altura dinâmica

## Contexto verificado

- `renderRodadaOg` (`src/features/og/rodada.tsx`): `SIZE = { width: 1080, height: 1080 }` fixo. Layout em coluna: cabeçalho (logo+GOLISEU, título, "Nª RODADA" fontSize 96, barra accent) → confrontos (`display:flex; flexDirection:column; gap:14; flex:1`) → rodapé "Acompanhe no Goliseu".
- `Linha`: `padding: "18px 28px"`, escudo `lado=92`. Altura da linha ≈ 92 + 36 (padding) = **128px**; `gap` entre linhas = **14px**.
- O `flex: 1` faz o bloco de confrontos tentar ocupar o espaço restante do canvas fixo; com mais linhas do que cabe, elas vazam (sem `overflow`) e o rodapé (irmão seguinte) é sobreposto/cortado.
- `MAX_LINHAS = 12`; `restantes` já desenha "+N confrontos".
- Consumido SÓ pelo Route Handler `.../imagem/route.tsx` (Web Share / download do dono) — **não** é o `og:image` de metadado da página, então variar a altura é seguro (não há card de aspecto fixo a respeitar).

## Decisões

### D1 — Altura calculada a partir do nº de confrontos visíveis
Antes de instanciar `ImageResponse`, calcular a altura para caber cabeçalho + N linhas + rodapé:

```
WIDTH = 1080
ROW_H = 128            // escudo 92 + padding vertical 18*2 — EXATO (escudo domina o texto)
ROW_GAP = 14
HEADER_H ≈ 385         // padding-top 64 + logo 64 + título(28+~56) + RODADA(4+96) + barra(28+8+36)
RESTANTES_H = restantes > 0 ? 48 : 0   // linha "+N confrontos" (fontSize 28 + marginTop 8)
FOOTER_H ≈ 126         // marginTop 28 + texto(~33, line-box do fontSize 26) + padding-bottom 64
altura = HEADER_H + N*ROW_H + max(0, N-1)*ROW_GAP + RESTANTES_H + FOOTER_H
height = max(1080, altura)   // mínimo preserva o quadrado das rodadas pequenas
```

O termo por-linha (`ROW_H`) é **exato**: a linha é dominada pelo escudo de 92px, não pelo texto, então o erro não acumula com N. Cabeçalho e rodapé têm textos **sem `lineHeight`**, cujo line-box no Satori mede **~1,276× o `fontSize`** (título 44→~56, rodapé 26→~33); somamos esse fator para a estimativa ficar de fato **conservadora** (sobra um respiro de fundo embaixo, inócuo; subestimar cortaria). A validação ao vivo (render do PNG real) confirma que nada corta e o rodapé não sobrepõe. Mantemos `width: 1080`.

### D2 — Remover `flex: 1` do container de confrontos
Sem altura fixa sobrando para "preencher", o bloco de confrontos passa a ter **altura natural** (soma das linhas) e o rodapé assenta logo abaixo. O outer mantém `height: "100%"` (= a altura calculada) e `flexDirection: column`; como a altura calculada ≈ conteúdo, não há expansão nem sobreposição. (Alternativa rejeitada: `justifyContent: space-between` — empurraria o rodapé para a borda deixando buraco no meio em rodadas médias.)

### D3 — Teto de linhas
Elevar `MAX_LINHAS` para cobrir o pior caso real. `getPartidasDaRodada` filtra só por `tournament_id + rodada` (sem "grupo"), então numa **fase de grupos** um único valor de `rodada` agrega os jogos de TODOS os grupos: 32 clubes ⇒ até **16 confrontos** numa rodada (mais que os 10 de uma liga de 20 clubes). Definir `MAX_LINHAS = 20` cobre isso com folga (altura ~3337px no pior caso desenhado — alto, mas válido e renderiza sem timeout); acima disso, "+N confrontos" continua (não corta). Limite existe só para não gerar PNG gigante.

## Edge cases

- **1 confronto**: altura = max(1080, header+128+footer) = 1080 (quadrado, com respiro). OK.
- **4 confrontos**: limiar do piso (conteúdo cru 1065 < 1080) → 1080. **5 confrontos**: 1207 (sai do piso).
- **10 confrontos** (Brasileirão): 1917px de altura; todos aparecem; rodapé abaixo. OK.
- **20 confrontos** (teto): 3337px; +faixa "+N" = 3385px. Renderiza sem timeout.
- **> 20 confrontos**: mostra 20 + "+N confrontos"; altura limitada.
- **ida-e-volta** (linha com "× / ida e volta"): coluna do meio ~50px < 92 do escudo → linha continua ~128px. OK.
- **Cores/tema**: inalterado. **Auth/posse/404**: inalterado.

## Testes

- `rodada.tsx` (ou via route): a `ImageResponse` resultante tem `height > 1080` quando há muitos confrontos e `= 1080` (mínimo) quando há poucos. Como `ImageResponse` não expõe trivialmente a altura, o teste cobre o helper puro `alturaDaRodada(n, temRestantes)` extraído do cálculo (determinístico): monotonicidade, piso 1080, **limiar do piso** (n=4 → 1080, n=5 → 1207), **teto** (n=20 → 3337; +restantes → 3385) e o acréscimo de `temRestantes` (+48).
- Live: gerar a imagem de uma rodada com 10 jogos e conferir que todos os 10 aparecem, o rodapé fica abaixo do 10º e nada corta (feito: render do PNG real, IHDR confere e inspeção visual com 10 e 20 confrontos).
