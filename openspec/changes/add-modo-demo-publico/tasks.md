## 0. Guard de isolamento (fazer PRIMEIRO — trilho de segurança)

- [ ] 0.1 Override ESLint `no-restricted-imports` (flat-config `eslint.config.mjs`) escopado a
  `src/app/demo/**` e `src/features/demo/**`, proibindo `@/actions`/`@/actions/*`,
  `@/lib/supabase`/`@/lib/supabase/*`, `@/features/*/data/*`, `**/*Connected` (glob com `**/`
  — `*` não cruza `/`), `@/features/match/components/LiveMatchesProvider`, `**/Live*`, com
  mensagem custom. **`allowTypeImports: true`** nos patterns de `@/features/*/data/*`,
  `@/lib/supabase/*` e `database.types` (type-imports das peças presentacionais são
  client-safe; só runtime é barrado).
- [ ] 0.2 Teste vitest de **grafo de imports TYPE-AWARE**: parse recursivo dos imports
  estáticos a partir de `src/app/demo` + `src/features/demo`, **descartando imports type-only**
  (`import type`, `import { type X }`, `export type`) e tratando re-exports (`export * from`,
  `export { x } from`), `import()` dinâmico e resolvendo o alias `@/` via `tsconfig` paths;
  falha se o fecho transitivo de RUNTIME alcançar `src/actions`, `src/lib/supabase` ou
  `src/features/*/data`. (Roda mesmo com a árvore ainda pequena; cresce junto — backstop do
  lint.)

## 1. Shell público `/demo` (layout + store + nav + ribbon)

- [ ] 1.1 `src/features/demo/store/perfil.ts` — tipo `PerfilDemo`
  (`visitante|tecnico|gestor|admin`) + derivação de flags **locais síncronas**: `podeGerir`,
  `podeModerar`, `podeArbitrar`, `podeReabrir`, `podeVerBastidores`, `podeAvancar`,
  `podeFechar` (NÃO reusar os gates reais server-only async).
- [ ] 1.2 `src/features/demo/store/demoReducer.ts` — estado + ações (`EDITAR_PLACAR`,
  `REGISTRAR_AUTORES`, `CRIAR_TORNEIO`, `EDITAR_TORNEIO`, `EXCLUIR_TORNEIO`, `MUDAR_STATUS`,
  `TOGGLE_LISTAR`, `TROCAR_PERFIL`, `REINICIAR`). Reducer PURO, testável isolado.
- [ ] 1.3 `src/features/demo/store/DemoProvider.tsx` (`"use client"`) — Context + `useReducer`
  semeado pelo **fixture determinístico**; re-hidratação do `localStorage` (chave
  `goliseu:demo:v1`) num **`useEffect` pós-mount** (nunca lazy-init lendo `localStorage` →
  evita mismatch SSR), flag `hidratado` antes de persistir, sem rede.
- [ ] 1.4 `src/features/demo/store/useDemoStore.ts` — hook + selectors tipados.
- [ ] 1.5 `src/features/demo/components/DemoRibbon.tsx` — faixa permanente "Modo demonstração
  — todos os dados são fictícios e nenhuma alteração será enviada ao sistema real." + chip do
  perfil simulado + botões "Reiniciar demonstração" e "Entrar e usar o Goliseu" (→ `/login`).
- [ ] 1.6 `src/features/demo/components/DemoNav.tsx` — header + NavLinks para `/demo/*`
  (torneios/ligas/copas/explorar), CTA estático "Criar conta" (sem `AccountMenu`/logout),
  `ModeToggle` reusado. Identificação visual clara do modo demo.
- [ ] 1.7 `src/features/demo/components/DemoPerfilSelector.tsx` — troca de perfil fictício
  (dispatch `TROCAR_PERFIL`); acessível (nomes/rótulos).
- [ ] 1.8 `src/features/demo/components/ReadOnlyBanner.tsx` — rótulo reutilizável para
  controles de gestão desabilitados ("Disponível no Goliseu real").
- [ ] 1.9 `src/app/demo/layout.tsx` — shell (StadiumBackdrop + `DemoNav` + `<DemoProvider>` +
  `DemoRibbon`); herda tema/Toaster/fontes/nonce do root layout. **Sem** `getPerfil`/supabase.

## 2. Fixtures (dados fictícios variados, cobrindo todos os estados)

- [ ] 2.1 `fixtures/identidades.ts` — `Record<id, IdentidadeDemo>` (~20; mistura
  `ehCompetitivo:true` com escudo-fallback e por-nome; `escudoUrl:null`/`avatarUrl:null`).
- [ ] 2.2 `fixtures/torneioLiga.ts` — 1 liga ~12 competidores, turno único;
  `PartidaCronologica[]` com 2-3 W.O. (`m.wo` consistente), 1-2 goleadas, uma sequência de
  vitórias/clean sheets (acende todos os Destaques + Forma) e 4-6 partidas em andamento
  (placar interativo mexe na tabela ao vivo).
- [ ] 2.3 `fixtures/autores.ts` — ~40-60 gols em ~15 autores (artilharia top-10 + "Ver mais")
  + `AutorInicial[]` para pré-carregar o modal. Muralha deriva das mesmas partidas.
- [ ] 2.4 `fixtures/torneioMataMata.ts` — chave de 8 (quartas/semis/final + 3º lugar),
  campeão decidido (CelebracaoTitulo); 1 fase pendente se for fazer "avançar fase".
- [ ] 2.5 `fixtures/piramide.ts` — 2-3 divisões (Série A/B/C) 10-14 cada + fronteiras/zonas de
  acesso/rebaixamento/playoff + partidas por divisão.
- [ ] 2.6 `fixtures/copa.ts` — origens (classificação final fixa) + `RegraCopa[]` +
  participantes derivados via `derivarPool`; 1 edição grupos+mata-mata (2-4 grupos).
- [ ] 2.7 `fixtures/perfilCompetidor.ts` — `CompetidorPerfil` + histórico 5-8 temporadas +
  insights + artilheiros + conquistas variadas + técnicos + 3-5 rivais +
  `Map<rivalId, ConfrontoDireto>`.
- [ ] 2.8 `fixtures/perfilTecnico.ts` — `TecnicoPerfil` + campanha + 2-3 clubes + adversários
  + Map confronto.
- [ ] 2.9 `fixtures/vitrine.ts` — volume suficiente para PAGINAÇÃO (mix liga/torneio, status
  variados incl. `inativo`/rascunho/arquivado, datas recentes vs. antigas) para
  busca/filtro/ordenação/paginação; inclui cenário de lista VAZIA.
- [ ] 2.10 `fixtures/partidasAtivas.ts` — 3-5 partidas ativas + estado vazio alternável.
- [ ] 2.11 **Espectro (ajuste G):** garantir nos fixtures ao menos um cenário de **alerta/aviso**
  visível (W.O. travado/disciplina/pendência), **variedade temporal** (datas recentes×antigas),
  status **`inativo`** distinto, e **volume p/ paginação** na lista de torneios E na vitrine.

## 3. Derivação (motores puros sobre o store)

- [ ] 3.1 `derive/derivarClassificacao.ts` — `store.partidas[]` → `computeStandings` +
  `calcularForma`/`calcularDestaques`/`calcularMuralha` + `derivarZonasDemo` (pura, local) →
  `LinhaComNome[]`/`Destaques`/`LinhaMuralha[]`/`StandingsZonas`. Cores via `resolverCores` de
  `championshipTheme` (não `/data`).
- [ ] 3.2 `derive/derivarArtilharia.ts` — **agregador puro reconstruído** (artilharia NÃO tem
  motor fora de `/data`): agrega por `(competitorId, nome.toLowerCase())`, ignora gol contra,
  menor grafia como display, ordena `gols desc → competitorNome → jogador` → `ArtilhariaLinha[]`.
- [ ] 3.3 Confronto direto: `confrontoDireto()` puro sobre fixtures (competidor e técnico).
- [ ] 3.4 Campanha do técnico: `agregarCampanhaTecnico` sobre `PartidaCreditada[]` fixture.

## 4. Placar interativo (o clímax) + autores

- [ ] 4.1 `adapters/DemoScoreModal.tsx` — envolve o `MatchScoreModal` CRU. `onSave` real
  entrega placar E autores num ÚNICO callback → despacha `EDITAR_PLACAR` **e**
  `REGISTRAR_AUTORES`, e mostra toast honesto de demonstração ("Placar atualizado na
  demonstração", nunca "salvo"). Seta `vagaId1`/`vagaId2` **sintéticos não-nulos** (senão a
  captura de autores não aparece), `carregarSugestoes = (vagaId) => Promise.resolve([...])` e
  `autoresIniciais`. **Gatilho por STRING** (`triggerLabel`/`triggerAriaLabel`/
  `triggerClassName`), nunca `<Button>` JSX.
- [ ] 4.2 `adapters/DemoMatchCard.tsx` — card reconstruído com átomos
  (`TeamCrest`/`UserAvatar`) + `DemoScoreModal`; NÃO reusa `MatchCard`/`*Connected`/`Live*`.
  Identidade por `ehCompetitivo`.
- [ ] 4.3 Registrar/corrigir autores no modal (teto por lado = placar) → `REGISTRAR_AUTORES`
  → artilharia recomputa.

## 5. Torneio de liga `/demo/torneios/[id]` + lista `/demo/torneios`

- [ ] 5.1 `components/DemoTorneioView.tsx` (client) — assina o store e monta os nodes do
  `TournamentTabs` [Classificação, Chave, Partidas, Números]. `StandingsTable expansivel`
  SEMPRE dentro de `ClassificacaoResponsiva`. Rankings via `RankingExpansivel`. Deep-link por
  hash.
- [ ] 5.2 `torneios/[id]/page.tsx` — resolve `id` → `<DemoTorneioView>`; `id` inexistente cai
  em estado "não encontrado" sem fetch.
- [ ] 5.3 `torneios/page.tsx` — lista com BUSCA + FILTRO(status) + ORDENAÇÃO + PAGINAÇÃO +
  estado vazio + CRIAR + EDITAR(renomear/formato) + EXCLUIR(confirmação) + MUDAR STATUS (tudo no
  store). Reusa `StatusPill`/`ChampionshipBadge`/`FORMATO_META`.

## 6. Mata-mata

- [ ] 6.1 `BracketView` alimentado por `torneioMataMata` fixture (guard p/ vazio) +
  `CelebracaoTitulo` no campeão decidido; `cor` via `resolverCores`.
- [ ] 6.2 (Se houver fôlego) botão "Avançar fase" via `gerarChaveMataMata`/motor puro →
  `AVANCAR_FASE`; celebração ao coroar campeão.

## 7. HUB `/demo`

- [ ] 7.1 `page.tsx` — partidas ativas (`DemoMatchCard` com placar interativo) + **painel de
  indicadores/dashboard explícito** (ajuste I: totais de torneios/partidas/gols, destaques do
  momento) + `DemoPerfilSelector` + CTA "Criar conta" + "Reiniciar demonstração"; estado vazio
  de partidas alternável.

## 8. Pirâmide de ligas

- [ ] 8.1 `components/DemoLigaView.tsx` — divisões + zonas (`derivarZonasDemo`) + rankings
  agregados; gestão (fluxo/playoffs/iniciar) read-only via `ReadOnlyBanner`/`podeGerir=false`.
- [ ] 8.2 `ligas/[id]/page.tsx` → `<DemoLigaView>`; `ligas/page.tsx` — lista de pirâmides
  (`SeasonStatusPill`).

## 9. Perfis (competidor e técnico)

- [ ] 9.1 `ligas/competidor/[id]/page.tsx` — árvore presentacional do perfil (read-only) +
  `DemoConfrontoDiretoPanel` (picker → `confrontoDireto()` puro; `ConfrontoResultado`
  reimplementado no namespace demo).
- [ ] 9.2 `ligas/tecnico/[userId]/page.tsx` — `TecnicoHero`/`CampanhaDeSempre`/
  `ClubesComandados`/`HallDaFama` + `DemoConfrontoTecnicosPanel`.

## 10. Copas

- [ ] 10.1 `components/DemoCopaView.tsx` + `copas/[id]/page.tsx` — bracket + classificação
  final (Crown na campeã); gestão read-only rotulada. `copas/page.tsx` — lista
  (`CupStatusPill`). `RuleListEditor` controlado + `derivarPool` puro se for exercitar regras.
  Reimplementar `VisualizacaoTorneio`/`ClassificacaoFinal`/`CartaoCopa` inline no namespace
  demo (não refatorar produção).

## 11. Explorar / Vitrine

- [ ] 11.1 `components/CardVitrineDemo.tsx` — reimplementa o `CardVitrine`/`VitrineVazia`
  inline de `explorar/page.tsx` (não exportados) no namespace demo.
- [ ] 11.2 `explorar/page.tsx` — BUSCA + FILTRO + ORDENAÇÃO + PAGINAÇÃO + estado vazio + toggle
  "listar" otimista, tudo client-side sobre `vitrine` fixture.

## 12. Toque em produção (mínimo)

- [ ] 12.1 `src/app/login/page.tsx` — link "Ver demonstração" → `/demo`. (Única mudança de
  produção além do override de lint.)

## 13. Testes automatizados (vitest)

- [ ] 13.1 `/demo` funciona sem cookies/sessão (render sem Supabase).
- [ ] 13.2 Rotas privadas (`/dashboard`) continuam exigindo auth (matcher/`PROTECTED_PREFIXES`
  intocados — smoke que confirma que não mudaram).
- [ ] 13.3 Navegação entre rotas `/demo/*`.
- [ ] 13.4 Grafo de imports do demo não alcança APIs reais (o guard da task 0.2).
- [ ] 13.5 Criar/editar (`CRIAR_TORNEIO`/`EDITAR_TORNEIO`) altera só o estado local (reducer).
- [ ] 13.6 Excluir não afeta banco (só store) + confirmação.
- [ ] 13.7 Reiniciar recupera o seed.
- [ ] 13.8 Troca de perfil fictício respeita permissões simuladas de UI.
- [ ] 13.9 Params manipulados (id inexistente) não acessam dados reais (fallback sem fetch).
- [ ] 13.10 Editar placar recomputa classificação/forma/destaques/Muralha/artilharia.
- [ ] 13.11 Console sem erros nos fluxos principais.

## 14. Acessibilidade / responsividade / gate

- [ ] 14.1 Validar 375/768/1366px: sem overflow horizontal; toque ≥44px; navegação por
  teclado; nomes acessíveis; foco correto nos modais; contraste; estados vazio/carregando.
- [ ] 14.2 Gate local verde antes de sinalizar: `pnpm typecheck && pnpm lint && pnpm test &&
  pnpm build` (comparar com baseline do HEAD se houver falha pré-existente).
- [ ] 14.3 **Gate reforçado (ajuste J):** na validação visual (375/768/1366), checar o painel de
  **network** do browser confirmando ZERO fetch/rede num fluxo real do `/demo`, e observar o
  peso do bundle client (fixtures + árvore client) — sem inchar.
