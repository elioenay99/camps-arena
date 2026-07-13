## Contexto

Toda a infra OG já existe e é consistente: `src/features/og/rodada.tsx`
(`renderRodadaOg`) e `temporada.tsx` (`renderTemporadaOg`) sobre `next/og` (Satori),
com `src/features/og/brand.tsx` (`carregarAssets`/`paraArrayBuffer`, fonte única já
compartilhada) e uma allowlist anti-SSRF de escudos. Os botões de compartilhar seguem
um padrão único (`CompartilharRodadaButton` → `compartilharWhatsApp`, texto montado no
servidor, imagem baixada no cliente por `fetch(..., { credentials: "same-origin" })`).
A classificação vem de um motor puro (`computeStandings`) já usado por torneio, liga e
copa. A celebração de título hoje é passiva (`trophy-sheen`/`animate-rise` em
`globals.css`). Esta change adiciona superfície nova reusando tudo isso, sem tocar o
banco. **Nada de CSP/matcher:** as rotas `.../imagem` dinâmicas passam pelo proxy
(recebem CSP no PNG, o que é inócuo) — só os cards OG por convenção de arquivo
(`opengraph-image`/`twitter-image`) são isentos no matcher, e `src/proxy.ts` NÃO é
tocado (o regex ancora no 1º segmento do path; mexer arrisca tirar auth-gate/refresh).

## Decisão 1 — Extrair um módulo de helpers OG compartilhado

`escudoDataURL`, `corDoNome`/monograma, `HEX6`, o tema base (FUNDO/ROXO/TEXTO) e a
allowlist `ESCUDO_HOSTS_CONFIAVEIS` vivem hoje dentro de `rodada.tsx`/`temporada.tsx`
(não exportados). Extrair para `src/features/og/compartilhado.tsx` e reimportar. As
fontes/logo (`carregarAssets`/`paraArrayBuffer`) NÃO se movem — já estão em
`brand.tsx`. **Refactor puro, sem mudança de comportamento.**

Rede de segurança: os `route.test.ts` de rodada/temporada fazem `vi.mock` dos
renderers, então **não exercitam** os helpers extraídos (são module-private). Logo a
segurança do refactor exige DOIS gates: (a) um `compartilhado.test.ts` novo testando
os helpers diretamente (host fora da allowlist ⇒ null; `HEX6` rejeita oklch e hex de
3 dígitos; `corDoNome` determinístico); (b) validação visual — baixar o PNG de rodada
e de temporada antes e depois do refactor e confirmar que são idênticos. Alternativa
(copiar helpers) descartada: multiplica a allowlist anti-SSRF (a lição do SSRF de
escudos já foi paga uma vez).

## Decisão 2 — Gating "qualquer logado" = auth + RLS, sem posse

As rotas de imagem de rodada/temporada checam posse (`created_by`). As NOVAS
(resultado, classificação de torneio, classificação de divisão, pôster do técnico)
**não checam posse**: exigem apenas `supabase.auth.getUser()` (sessão) e montam a
imagem com o **cliente Supabase do usuário** (anon+cookies), deixando a RLS decidir o
que ele vê. **Nunca service-role** nessas rotas. Consequências obrigatórias:
- **Resultado:** `getPartidaParaImagem` lê UMA `matches` por id sob RLS e projeta
  `tournament_id`; a rota exige `match.tournament_id === id` (senão 404, espelhando o
  cross-check `comp.id !== id` da rota de temporada). Não-dono só recebe partida de
  rodada liberada; recurso ausente/oculto/divergente ⇒ **404 sem oráculo**.
- **Classificação:** `getTournamentClassificacao`/`getDivisionStandings` já rodam sob
  RLS; a tabela pode sair **parcial** para não-dono (só rodadas liberadas) — aceitável
  e esperado. A imagem não "completa" nada por fora.
- **Pôster do técnico:** carreira/troféus já são leitura pública a logados.
  `getTecnicoProfile` null ⇒ 404 (usuário inexistente/ilegível). Uma conta REAL sem
  histórico retorna perfil não-nulo (`clubes: []`); nesse caso a rota aplica o mesmo
  gate de histórico do botão (404 quando campanha e troféus vazios), para não servir
  um pôster vazio via URL direta.
- O **pôster de temporada** permanece **dono-only** (rota inalterada) — só ganha botão.

## Decisão 3 — Card de classificação: ancoragem e escopo

A tabela de liga NÃO é por `season_id` nem por `tournament_id`: é por
`division_season` (`league_division_seasons.id` = `div.id`), e a classificação das
divisões é uma **página única** (`ligas/[id]`, não por-divisão). As **zonas** de
sobe/cai já vêm prontas no retorno de `getDivisionStandings` (que chama `derivarZonas`
internamente, com os metadados de playoff que o caller não possui) — a rota apenas
**LÊ `.zonas`**, não recomputa. O **split** (Apertura+Clausura) usa a tabela ANUAL
COMBINADA já embutida em `getDivisionStandings`. A rota da divisão recebe `[id]`
(liga), `[seasonId]` (para `fronteiras` via `getSeason`) e `[divisionSeasonId]`; o 2º
parâmetro `userId` de `getDivisionStandings` é aceito por aridade mas ignorado (o gate
é a RLS via `createClient` interno). O segmento `divisao/[divisionSeasonId]/imagem` é
aninhamento **NOVO** (só
`ligas/[id]/temporada/[seasonId]` preexiste). O renderer `renderClassificacaoOg`
recebe `linhas` + `zonas` opcionais e serve torneio (sem zonas) e divisão (com zonas)
sem ramo divergente, usando `avatarUrl` (foto) no avulso quando houver.

**Escopo:** só formato **liga** (pontos corridos) tem tabela única com significado. O
card/botão de torneio fica restrito a `formato === 'liga'`. Formato de **grupos**
(`grupos_mata_mata`/`fase_liga` e copas de grupos) fica de FORA nesta change:
`getTournamentClassificacao().linhas` ali é um AGREGADO que a UI nunca exibe como
tabela única (a UI mostra tabelas por-grupo). Uma variante por-grupo (rota recebendo o
número do grupo, usando `grupos[g].linhas`) é frente futura.

## Decisão 4 — Card de resultado: shape, cross-check e avulso

Estender o shape `PartidaEncerrada` (traz `placar_1/2`, `nome_1/2`, `escudo_1/2`,
`wo`, `woVencedorLado`, `woDuplo`) com `tournament_id` + `avatarUrl_1/2`, via
`getPartidaParaImagem(supabase, matchId)` (recebe o cliente Supabase do usuário,
coerente com a Decisão 2). O fetcher SHALL projetar `tournament_id` e ler AMBOS os
caminhos de embed: competitivo (`v1/v2` → clube +
escudo) e **avulso** (`p1/p2` → nome do participante + `avatarUrl`, sem escudo). Sem
isso, o card do avulso renderiza "A definir x A definir" (v1/v2 nulos). Os **selos são
derivados no renderer**, sem coluna nova: **GOLEADA** quando `!wo && |placar_1 −
placar_2| ≥ 3`; **W.O.** quando `wo && !wo_duplo` (marca o vencedor); **W.O. DUPLO**
quando `wo_duplo`. A projeção de lado (competitivo × avulso) e a derivação de selo são
funções puras testáveis. Altura fixa (uma partida não cresce).

## Decisão 5 — Celebração ativa: só campeão, ancorada no BracketView

`CelebracaoTitulo` é um componente **client** (`"use client"`) que, ao montar, dispara
um burst one-shot de confete sobre o destaque do campeão, colorido pela `cor` recebida
por prop. Respeita `prefers-reduced-motion` via `matchMedia` (reduzido ⇒ não monta o
confete; mantém o destaque estático). Guard anti-repetição por identificador da chave
(`sessionStorage`) para não reanimar a cada `router.refresh`/renavegação.

**Fiação corrigida contra o código real:**
- O `BracketView` é **RSC**, deriva o campeão internamente e recebe apenas
  `{ partidas, terceiroLugar }` — NÃO recebe o nome, e já tem o escudo em
  `partidas[].escudo_1/2`. Portanto `CelebracaoTitulo` é ancorado **DENTRO** do
  `BracketView`, que passa a receber só props serializáveis novas: `cor?` (de
  `resolverCoresTorneio`) e `celebrarCampeao?: boolean`. **Não** se cruza JSX de
  client-comp pela fronteira RSC (lição `e559a9f`).
- Como `GrandeFinalPanel` **embute** o `BracketView` como `ReactNode`, essa única
  ancoragem cobre torneio, copa E grande final de divisão — sem tocar o
  `GrandeFinalPanel`.
- **`celebrarCampeao` só é true onde a chave coroa um CAMPEÃO** (final de torneio,
  final de copa, grande final de divisão). NUNCA em playoff de acesso, playout ou
  barragem (`PlayoffsPanel`) — esses também usam bracket, mas decidem promoção/
  rebaixamento, não título. Cada call-site decide o flag pelo seu contexto.
- `FluxoTemporadaPanel` NÃO tem destaque de campeão — foi removido da lista de
  superfícies (era premissa errada).
- Call-sites de `BracketView`/cor a alimentar: `torneios/[id]/page.tsx`,
  `copas/edicao/[id]/page.tsx`, `ligas/[id]/page.tsx` (grande final e, com
  `celebrarCampeao=false`, os playoffs).

## Decisão 6 — Convenção CSS opt-out e nome sem colisão

`globals.css` documenta que toda classe `hs-*` nova DEVE ser adicionada ao bloco
`@media (prefers-reduced-motion: reduce)`. O burst usa um nome NOVO e distinto (ex.:
`hs-burst`) — `hs-confetti`/`@keyframes hs-confetti` já existem (loop infinito do hero
da landing, `globals.css:410/448`, já no bloco reduced-motion). A cor entra por CSS
custom property. O JS ainda checa `matchMedia` para não montar o confete sob movimento
reduzido (defesa em profundidade).

## Riscos e mitigação

- **Vazamento por gating fraco:** mitigado por nunca usar service-role nas rotas
  novas, pelo cross-check `tournament_id === id` no resultado, e por testes de rota
  (404 sem oráculo). O reviewer adversarial deve caçar qualquer fetch que ignore a
  sessão do usuário.
- **Satori:** só flexbox + cores hex (sem grid/oklch). Escudos entram como data URL
  (fetch server-side com timeout, fallback monograma/foto). Tabelas longas: teto de
  linhas + "+N".
- **Regressão nos OG existentes:** coberta pelo `compartilhado.test.ts` + validação
  visual antes/depois (os `route.test.ts` mockam os renderers e não bastam).
- **Celebração indevida:** o flag `celebrarCampeao` por call-site é a defesa contra
  celebrar vencedor de playoff/playout/barragem; o guard por `sessionStorage` evita
  repetição.
- **`prefers-reduced-motion`:** teste unitário com `matchMedia` mockado garantindo
  que reduzido não monta confete.
