## Why

A imagem da rodada (`renderRodadaOg`, `src/features/og/rodada.tsx`) é gerada com tamanho **fixo 1080×1080**. Cada linha de confronto ocupa ~142px (escudo 92px + padding 36 + gap 14), então só cabem ~4-5 linhas na altura disponível depois do cabeçalho. O container dos confrontos usa `flex: 1` **sem `overflow`** e o rodapé "Acompanhe no Goliseu" vem logo depois: numa rodada com muitos jogos (um Brasileirão tem **10 jogos/rodada**) as linhas extras vazam para baixo, **sobrepõem o rodapé** e são **cortadas** pela borda da imagem. O dono compartilha uma imagem pela metade. O texto do compartilhamento já lista todos os jogos corretamente — só a imagem quebra.

## What Changes

- **Altura dinâmica**: a imagem deixa de ser quadrada fixa e passa a ter **altura calculada a partir do número de confrontos visíveis** (largura segue 1080). Todos os jogos da rodada aparecem, sem corte, mantendo o tamanho atual de escudo/fonte (legível no WhatsApp).
- O rodapé "Acompanhe no Goliseu" SEMPRE fica **abaixo** do último confronto (sem `flex: 1` empurrando/sobrepondo).
- **Altura mínima** preservada para rodadas pequenas (≤ ~4 jogos continuam num formato próximo do quadrado atual, sem encolher).
- O teto de linhas (`MAX_LINHAS`) é elevado o suficiente para cobrir uma rodada de liga (≥ 20 clubes → 10 jogos) e fases de grupos; acima do teto, mantém o rodapé "+N confrontos" (limite só para não gerar imagem absurdamente alta).

## Capabilities

### Modified Capabilities

- **og-images**: a imagem da rodada passa a ter **altura dinâmica** (cresce com o nº de confrontos) garantindo que TODOS os jogos visíveis apareçam sem corte e sem sobrepor o rodapé.

## Impact

- **Sem DDL.** Mudança contida em `src/features/og/rodada.tsx` (cálculo de altura + remoção do `flex: 1`) + teste.
- **Compatibilidade**: rodadas pequenas mantêm aparência atual (altura mínima); rodadas grandes deixam de cortar. Nenhuma mudança na rota, auth, ou no texto/links do compartilhamento.
- **Performance**: idêntica (mesma busca de escudos; só muda a dimensão do canvas).
