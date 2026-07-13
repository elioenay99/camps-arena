## Why

O Goliseu já captura tudo o que acontece num campeonato (placares, artilharia,
títulos, carreira de técnico), mas **quase nada disso vira imagem compartilhável** —
o loop viral natural do produto (o zap do grupo depois do jogo) fica ocioso. Hoje só
existe um card OG de rodada (dono-only) e um pôster de temporada que está **órfão**
(a rota de imagem existe, mas nenhum botão aponta pra ela). Além disso, o **clímax do
produto — sagrar-se campeão — passa em branco**: os painéis de título só mostram um
`trophy-sheen` passivo em loop, sem um momento ativo de comemoração.

Esta change entrega a **Frente "Compartilhável"**: transforma os momentos de maior
carga emocional do app em artefatos que o usuário manda no grupo, e faz o campeão ser
celebrado ativamente. É a frente de melhor valor/esforço do inventário porque **reusa
integralmente a infra existente** (`next/og` + Satori, `escudoDataURL`,
`resolverCoresTorneio`, `compartilharWhatsApp`, `computeStandings`, os keyframes CSS
`hs-*`) e é **ZERO-DDL** — não cria tabela, coluna, função ou policy; lê apenas dados
que os fetchers atuais já entregam sob a RLS do usuário.

**Decisões de produto (travadas pelo dono — não reabrir):**
1. **Quem compartilha = qualquer participante logado** (não só o organizador). Os
   dados dos cards novos já são visíveis a qualquer logado pela RLS, então a imagem
   nunca revela mais do que o usuário já enxerga. As rotas de imagem NOVAS são
   auth-gated (exigem sessão) e confiam na RLS — sem checagem de posse.
2. **Snapshot da classificação cobre torneios (pontos corridos) E ligas/pirâmide**
   (por divisão, com zonas de sobe/cai e o caso de split Apertura+Clausura combinado).
   O formato de **grupos** fica de fora nesta change (frente futura — precisa de uma
   variante por-grupo).
3. **Pôster pessoal do técnico entra agora** — um renderer OG novo (campanha de
   sempre + troféus herdados), com sua própria rota e botão no perfil do técnico.
4. O **pôster de temporada** existente (do CLUBE, dono-only) NÃO muda de gating — só
   ganha o botão que faltava (wire do órfão); segue restrito ao dono da liga.
5. A **celebração ativa** é um burst único (confetti nas cores do campeonato), opt-out
   por `prefers-reduced-motion` (a cor do confete vem de `resolverCoresTorneio` — as
   cores do campeonato/divisão), disparado apenas quando uma chave coroa um CAMPEÃO
   (final de torneio, final de copa, grande final de divisão de liga) — NUNCA em
   playoff de acesso, playout ou barragem.

## What Changes

- **Renderers OG novos** (`src/features/og/`), reusando helpers extraídos para
  `src/features/og/compartilhado.tsx`. As fontes/logo (`carregarAssets`/
  `paraArrayBuffer`) JÁ vivem em `brand.tsx` e permanecem lá; o módulo novo move
  apenas o que hoje é privado de `rodada.tsx`/`temporada.tsx`: `escudoDataURL`,
  `corDoNome`/monograma, `HEX6`, o tema base e a allowlist anti-SSRF
  `ESCUDO_HOSTS_CONFIAVEIS` — sem duplicá-los pelos renderers novos:
  - `partida.tsx` (`renderPartidaOg`): card de **resultado de uma partida encerrada**
    — placar grande, escudos/monogramas dos dois lados (competitivo: escudo do clube;
    **avulso**: nome do participante + foto `avatarUrl` quando houver, senão
    monograma), selos derivados **GOLEADA** (`!wo && |dif| ≥ 3`), **W.O.** e **W.O.
    DUPLO**, tematizado por `resolverCoresTorneio`.
  - `classificacao.tsx` (`renderClassificacaoOg`): card de **tabela** — posição,
    escudo (ou foto `avatarUrl` no avulso, ou monograma), nome, P/J/V/E/D/SG, com
    faixas de **zona** (acesso/rebaixamento) quando fornecidas. Altura dinâmica (piso
    quadrado), teto de linhas com "+N".
  - `tecnico.tsx` (`renderTecnicoOg`): **pôster pessoal do técnico** — foto/avatar,
    nome, campanha de sempre (J/V/E/D, aproveitamento) e troféus.
- **Rotas de imagem novas** (Route Handlers GET, `image/png`), auth-gated por sessão,
  passando pelo proxy como as rotas `.../imagem` existentes (o header CSP na resposta
  PNG é inócuo — NÃO se mexe no matcher):
  - `torneios/[id]/partida/[matchId]/imagem` — sessão, sem posse; RLS entrega a
    partida; `getPartidaParaImagem` projeta `tournament_id` e a rota EXIGE
    `match.tournament_id === id` (senão 404 sem oráculo, evitando cor de torneio
    alheio). Não-dono só vê rodada liberada ⇒ senão 404.
  - `torneios/[id]/classificacao/imagem` — sessão, sem posse; só para torneio de
    formato **liga** (pontos corridos); usa `getTournamentClassificacao(id).linhas`.
  - `ligas/[id]/temporada/[seasonId]/divisao/[divisionSeasonId]/imagem` — segmento
    NOVO na árvore; sessão; usa `getDivisionStandings(divisionSeasonId, userId,
    fronteiras)` e LÊ o `.zonas` já pronto do retorno (que embute as fronteiras de
    playoff que o caller não tem); cobre o split combinado.
  - `ligas/tecnico/[userId]/imagem` — sessão; `getTecnicoProfile` como gate de
    existência (null ⇒ 404 sem oráculo) e fonte de nome/foto; `getTecnicoCampanha`
    (J/V/E/D + aproveitamento; `agregarCampanhaTecnico` é seu helper puro interno);
    `getConquistasDoTecnico` (troféus).
- **Botões de compartilhar** (client, espelhando `CompartilharRodadaButton` +
  `compartilharWhatsApp`), com texto montado no servidor:
  - `CompartilharResultadoButton` no cluster de ações de cada partida encerrada
    (`MatchHistoryList`, que passa a receber a prop `tournamentId`).
  - `CompartilharClassificacaoButton` junto ao `StandingsTable` (torneio de liga e
    cada divisão da pirâmide).
  - `CompartilharTemporadaButton` na seção "fim de temporada" da liga (dono-only —
    wire do pôster órfão existente).
  - `CompartilharTecnicoButton` no cabeçalho do perfil do técnico (só quando o técnico
    tem histórico — não gera "pôster de nada").
  - Novas mensagens em `src/lib/whatsapp.ts`: `mensagemResultado`,
    `mensagemClassificacao`, `mensagemTemporada`, `mensagemTecnico`.
- **Celebração ativa do título** (`title-celebration`): componente client
  `CelebracaoTitulo` que dispara um burst one-shot de confete nas cores do campeonato
  (via `resolverCoresTorneio`) ao montar, respeitando `prefers-reduced-motion` (nesse caso mantém o destaque
  estático). Ancorado DENTRO do `BracketView` (RSC — recebe só props serializáveis
  `cor` + `celebrarCampeao`, sem cruzar JSX de client-comp na fronteira RSC; lição do
  fix `e559a9f`). Como `GrandeFinalPanel` embute o `BracketView` como `ReactNode`, uma
  única ancoragem cobre torneio, copa e grande final de divisão; os call-sites que NÃO
  são título (playoff/playout/barragem) passam `celebrarCampeao=false`. Call-sites de
  cor a alimentar: `torneios/[id]/page.tsx`, `copas/edicao/[id]/page.tsx`,
  `ligas/[id]/page.tsx`.
- **Design system:** primitiva de celebração reusável — keyframes de burst com nome
  novo (ex.: `hs-burst`, para não colidir com o `hs-confetti`/`@keyframes
  hs-confetti` já usado no hero da landing), cor-aware por CSS custom property, e
  adicionados ao bloco `@media (prefers-reduced-motion: reduce)`.

## Capabilities

### Added Capabilities
- `title-celebration`: comemoração ativa e única quando uma chave coroa um campeão
  (final de torneio, final de copa, grande final de divisão), com confete nas cores do
  campeonato e opt-out por `prefers-reduced-motion`; nunca em playoff/playout/barragem.
  Inclui o botão de compartilhar o pôster de temporada.

### Modified Capabilities
- `og-images`: novos renderers/rotas de imagem — resultado de partida, classificação
  (torneio de liga e divisão de pirâmide) e pôster do técnico; todas auth-gated por
  sessão (qualquer logado), confiando na RLS; passam pelo proxy como as rotas
  `.../imagem` existentes.
- `match-history`: cada partida encerrada ganha "Compartilhar resultado".
- `standings-page`: a classificação (torneio de liga e divisões da pirâmide) ganha
  "Compartilhar classificação".
- `coach-history`: o perfil do técnico ganha "Compartilhar pôster" (quando há histórico).
- `design-system`: primitiva de celebração/confete reusável, cor-aware e opt-out por
  movimento reduzido.

## Impact

- **Banco de dados:** NENHUM. Zero DDL — sem tabela, coluna, função, trigger ou
  policy. Toda a leitura passa pelos fetchers existentes sob a RLS do usuário.
- **Código de aplicação:** 3 renderers OG novos + 1 módulo de helpers OG extraído (de
  `rodada.tsx`/`temporada.tsx`); 4 rotas de imagem; 4 botões client + 4 mensagens
  WhatsApp; 1 primitiva de celebração + ancoragem no `BracketView` gated por
  `celebrarCampeao`; passagem de cor do campeão nas páginas de torneio/copa/liga; a
  prop `tournamentId` no `MatchHistoryList`. NÃO se edita `src/proxy.ts`.
- **Segurança:** as rotas de imagem novas são auth-gated (exigem sessão) e **sem
  checagem de posse por design** — a defesa é a RLS já existente (a imagem é montada
  com o cliente Supabase do usuário; nunca service-role). A rota de resultado ainda
  cruza `tournament_id === id` da URL (espelhando o cross-check da rota de temporada),
  para não vazar cor/contexto de outro torneio nem servir de oráculo. A allowlist
  anti-SSRF de escudos é reusada intacta; nenhuma rota nova aceita host/URL externo do
  cliente. O pôster de temporada permanece dono-only.
- **Dependências:** nenhuma nova.
- **Testes:**
  - **Vitest:** mensagens puras; derivação de selos (GOLEADA/W.O./W.O. DUPLO) e a
    projeção de lado (competitivo × avulso) como funções puras; os botões (mock de
    `compartilharWhatsApp`, valida `texto/title/getFile`, espelhando
    `CompartilharRodadaButton.test.tsx`); o opt-out do `CelebracaoTitulo` (mock
    `matchMedia` → sem confete) e o guard anti-repetição.
  - **`compartilhado.test.ts` (rede de segurança REAL do refactor):** os
    `route.test.ts` existentes fazem `vi.mock` dos renderers e NÃO exercitam os
    helpers extraídos — então um teste direto dos helpers é obrigatório: host fora da
    allowlist ⇒ null; `HEX6` rejeita oklch/3-dígitos; determinismo de `corDoNome`.
    Complementa a validação visual (baixar o PNG de rodada/temporada antes e depois do
    refactor — devem ser idênticos).
  - **Rotas OG novas:** `route.test.ts` — 200 para logado com acesso; 404 sem oráculo
    quando a RLS não entrega (ou `tournament_id` diverge); anônimo barrado.
