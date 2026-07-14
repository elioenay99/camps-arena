## 1. Modal de placar — identidade e scoreboard

- [x] 1.1 Discriminador `ehCompetitivo: boolean` em `ParticipantePartida`, setado em AMBOS
  os returns de `ladoVaga`→true (INCLUSIVE o ramo bye, `MatchCard.tsx:74-79`, senão fica
  `undefined`=falsy e o helper trata como avulso) e `ladoAvulso`→false. (Cuidado de leitura
  com o `const ehCompetitivo` local em `MatchCard.tsx:133` — é campo de objeto, sem conflito
  real; qualificar via `participante.ehCompetitivo`.) Helper interno
  `IdentidadeLado({ participante, size=40 })`: ramifica POR `ehCompetitivo` (NUNCA por
  `clube`) — competitivo → `TeamCrest` do escudo; avulso → FOTO da pessoa (Avatar ~40px,
  fallback iniciais); + nome uma vez (`truncate min-w-0`) + `detalhe`. Remove o `Avatar`
  64px e o bloco duplicado (l.290-300).
- [x] 1.2 Scoreboard 2-up que CABE: `grid grid-cols-[1fr_auto_1fr] items-start gap-1`,
  **`min-w-0` nas duas trilhas 1fr** e em cada coluna (`flex flex-col items-center gap-2
  min-w-0`), "×" central `self-center`. Cada coluna = `IdentidadeLado` + `Stepper`
  compacto (task 2.2).
- [x] 1.3 "Chamar {adversário}" e (no avulso) `TeamSearchInput` + clube cosmético atual
  vão para uma seção de largura total ABAIXO do scoreboard (fora das colunas). O clube do
  avulso NÃO some — só sai da coluna.

## 2. Modal de placar — autores, stepper, safe-area

- [x] 2.1 "Autores dos gols (opcional)" (os dois `AutoresLado`) num `<details>`;
  `<summary>` com o texto EXATO "Autores dos gols (opcional)" em nó próprio (chevron/"+"
  como ícone `aria-hidden` à parte), toque ≥44px. Abertura CONTROLADA por estado:
  `const [autoresAbertos, setAutoresAbertos] = useState(() => temPreload)` + `<details
  open={autoresAbertos} onToggle={(e) => setAutoresAbertos(e.currentTarget.open)}>` (NÃO
  `open` cru — reabriria a cada re-render do Stepper); ressincronizar `temPreload` no
  `handleOpenChange`. `temPreload` = preload (`autoresIniciais`→`preloadDoLado`) tem linhas
  — senão o organizador (REPLACE) não vê autores gravados. Estado dos autores no pai
  PERSISTE (só CSS oculta). Foto de evidência FORA do `<details>`.
- [x] 2.2 Stepper do placar COMPACTO no 2-up: botões `size-10` (40px — MANTÉM o toque
  atual, NÃO sobe pra 44px, que não caberia); número SEM min-width fixo (`tabular-nums`;
  no máx `min-w-6`=24px, NÃO `min-w-8`, que estoura o budget); fonte `text-4xl`→`text-2xl
  sm:text-3xl`; `gap-1`. (Os steppers do `AutoresLado` ficam como estão.)
- [x] 2.3 Rodapé do modal: `pb-[max(1rem,env(safe-area-inset-bottom))]` (defensivo — hoje
  = pb-4, pois sem `viewport-fit:cover` o env resolve 0). NÃO ligar `viewport-fit: cover`.
- [x] 2.4 Testes: identidade única por lado (sem nome duplicado); **avulso-com-clube**
  (foto+nome da PESSOA na coluna, clube na seção de baixo); scoreboard 2 colunas; autores
  dentro do `<details>` (open com preload, fechado sem); a asserção da string "Autores dos
  gols (opcional)" (`MatchScoreModal.test.tsx:254/261`) segue casando; lógica de
  salvar/autores/foto/modos intacta. Testes existentes verdes.

## 3. Rankings top 10 + expandir

- [x] 3.1 `RankingExpansivel({ children })` (client leaf) RENDERIZA o próprio `<ol id>`
  (classes `list-none flex flex-col gap-2 p-0`) a partir dos `<li>` children; mostra os 10
  primeiros; se `React.Children.count > 10`, um `<button aria-expanded aria-controls
  min-h-11>` "Ver mais (N) / Ver menos" como IRMÃO fora do `<ol>` alterna a lista completa.
- [x] 3.2 `ArtilhariaRanking` e `MuralhaRanking` passam só os `<li>` como children de
  `RankingExpansivel` (deixam de renderizar o próprio `<ol>`). Fetchers/RSC inalterados.
- [x] 3.3 Testes: mostra 10 + expande para todos; aria correto; ≤10 não mostra botão.

## 4. Gate e validação

- [ ] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] 4.2 Validação visual em **360 / 390 / 412px** (PWA) + desktop, temas dark/light: SEM
  scroll horizontal no card do placar; placar 2-up; autores recolhidos; rankings top-10 +
  expandir. Testar nome de clube longo (ex.: "Sport Club Corinthians Paulista") E placar de
  2 dígitos (ex.: 10×10) a 360px — os dois gatilhos de overflow do 2-up.
