## Contexto

O produto tem duas camadas bem separadas que esta change explora:

1. **Componentes presentacionais** — `StandingsTable`, `BracketView`, `MatchScoreModal`,
   `ArtilhariaRanking`/`MuralhaRanking`/`RankingExpansivel`, `DestaquesClassificacao`,
   `FormaBadges`, `TournamentTabs`, `StatusPill`/`ChampionshipBadge`, átomos
   `TeamCrest`/`UserAvatar`. Nenhum toca Supabase em runtime; recebem dados por props e no
   máximo importam ENUMs type-only de `database.types` (apagados na compilação).
2. **Motores puros zero-IO** — `computeStandings` (`src/features/standings/computeStandings.ts`),
   `insights.ts` (`calcularForma`/`calcularDestaques`/`calcularMuralha`/`confrontoDireto`/
   `resultadoDoLado`), `coachStats.ts` (`agregarCampanhaTecnico`),
   `championshipTheme.ts` (`resolverCores`/`champThemeProps`/`onColor`),
   `gerarChaveMataMata.ts`, `gerarFaseDeGrupos.ts`/`agregadoGrupos.ts`, `cup/derivacao.ts`
   (`derivarPool`). Todos são funções puras, **fora de `*/data/*`**, seguras para o cliente.

A fronteira que **não** pode ser cruzada é a camada de dados/mutação: `@/actions/*`
(bundles `"use server"`), `@/lib/supabase/*`, os fetchers `@/features/*/data/*`, os
componentes `*Connected` e o subsistema `Live*`/`LiveMatchesProvider` (Realtime). A
estratégia é **reconstruir a árvore de render no cliente**, assinando um store local, e
**derivar** tudo com os motores puros — igual ao que os fetchers fazem no servidor, só que
sobre fixtures em memória.

`/demo` já é público por construção: o matcher em `src/proxy.ts` e o `PROTECTED_PREFIXES`
de `src/lib/supabase/middleware.ts` só protegem `/dashboard` e `/atualizar-senha`. `/demo`
não casa nenhum prefixo protegido, então recebe CSP+nonce normalmente e não exige sessão —
**sem tocar em nada** desses arquivos.

## Decisão 1 — Isolamento por subárvore 100% client + guard mecânico duplo

Todo o estado vive num único `DemoProvider` (`"use client"`, Context + `useReducer`)
montado em `src/app/demo/layout.tsx` e semeado pelos fixtures. Cada "mutação" é uma ação do
reducer (`EDITAR_PLACAR`, `REGISTRAR_AUTORES`, `CRIAR_TORNEIO`, `EXCLUIR_TORNEIO`,
`MUDAR_STATUS`, `TOGGLE_LISTAR`, `TROCAR_PERFIL`, `REINICIAR`, e — se houver fôlego —
`AVANCAR_FASE`). **Nenhuma** persistência de rede; persistência local opcional em
`localStorage` sob chave versionada `goliseu:demo:v1` (a versão invalida seeds antigos),
com botão "Reiniciar demonstração" que descarta o estado e recarrega o seed.

O isolamento é garantido por **dois** mecanismos verificáveis no CI, não só disciplina — e
ambos precisam nascer VERDES (não podem barrar as próprias peças presentacionais que o design
manda reusar, que fazem `import type` de camadas proibidas mas são apagadas na compilação):

- **ESLint `no-restricted-imports`** num override escopado a `src/app/demo/**` e
  `src/features/demo/**` (flat-config em `eslint.config.mjs`, hoje sem override algum),
  proibindo os patterns: `@/actions`/`@/actions/*`, `@/lib/supabase`/`@/lib/supabase/*`,
  `@/features/*/data/*`, `**/*Connected`, `@/features/match/components/LiveMatchesProvider`,
  `**/Live*`. **Com `allowTypeImports: true`** nos patterns de `@/features/*/data/*`,
  `@/lib/supabase/*` e `database.types` — decisão travada: `import type { TournamentStatus }`,
  `LinhaComNome`, `PartidaDaChave`, `ArtilhariaLinha`, `LinhaMuralha` etc. passam (são
  type-only, 100% client-safe); só o import de RUNTIME é barrado. (Sem isso, o override daria
  falso-positivo contra `StandingsTable`/`BracketView`/`ArtilhariaRanking`/`computeStandings`,
  que type-importam de `/data` e `database.types`.) O glob correto é `**/*Connected` — no
  minimatch `*` não cruza `/`, e o único `*Connected` (`MatchScoreModalConnected`) tem barras.
- **Teste de grafo de imports (vitest) TYPE-AWARE** que faz o parse recursivo dos imports
  estáticos a partir de `src/app/demo` + `src/features/demo` e **falha** se o fecho transitivo
  de RUNTIME alcançar `src/actions`, `src/lib/supabase` ou qualquer `src/features/*/data`.
  Antes de percorrer, DESCARTA imports type-only (`import type …`, `import { type X }`,
  `export type`) — 40 arquivos presentacionais type-importam `database.types` e vários
  type-importam de `/data`, e todos são apagados na compilação. O grafo também trata
  re-exports (`export * from`, `export { x } from`), `import()` dinâmico, e resolve o alias
  `@/` via `tsconfig` paths. É o backstop que pega reexport transitivo de runtime que o lint
  não pega. (Proibir `@/features/*/data/**` inteiro é seguro: **nenhum** motor puro que o demo
  precisa mora em `/data` — os que estão lá, ver Decisão 2, são replicados.)

## Decisão 2 — Motores puros presos em `/data`: replicar o mínimo, nunca refatorar produção

Duas funções puras necessárias vivem, hoje, DENTRO de arquivos que importam Supabase:

- `derivarZonas` — dentro de `src/features/league/data/getDivisionStandings.ts` (fetcher).
- `resolverCoresTorneio` — dentro de `src/features/standings/data/getTournamentClassificacao.ts`
  (fetcher). É um wrapper fino sobre `resolverCores` de `championshipTheme.ts`.

O guard bloqueia `/data`, então o demo **não** as importa. Solução (mantendo o diff de
produção mínimo — não extrair de arquivos de produção):
- **Cores:** usar diretamente `resolverCores`/`champThemeProps`/`onColor` de
  `src/features/championship/championshipTheme.ts` (puro, fora de `/data`).
- **Zonas:** derivar as `StandingsZonas` no `derive/` do demo a partir das fronteiras
  declaradas no fixture da pirâmide (função pura pequena `derivarZonasDemo`, espelhando a
  regra de acesso/rebaixamento/playoff). Nunca duplicar regras de W.O./promédio/desempate —
  essas continuam vindo de `computeStandings`/`insights`.

## Decisão 3 — Derivar, nunca pré-computar (a "regra de ouro dos fixtures")

Os fixtures declaram apenas o **material bruto**: arrays de `PartidaCronologica` +
`Record<id, IdentidadeDemo>`. Tudo o que a UI mostra — classificação, forma, destaques,
Muralha, artilharia, zonas, confronto direto, campanha de técnico — é **derivado ao vivo**
pelos motores puros em `src/features/demo/derive/derivarClassificacao.ts`.

**Exceção — artilharia não tem motor puro fora de `/data`:** `insights.ts` agrega
forma/destaques/**Muralha**/confronto, mas **não** artilharia. A agregação de artilheiros mora
em `getArtilharia.ts` (server-only, `/data`). Portanto o demo **reconstrói** o agregador puro em
`derive/derivarArtilharia.ts`, espelhando exatamente a regra real: agrega por
`(competitorId, nome.toLowerCase())` (homônimos sob competidores diferentes contam separado),
**ignora gol contra**, escolhe a menor grafia como display, soma gols e ordena por
`gols desc → competitorNome → jogador`; produz `ArtilhariaLinha[]` (type-import do tipo é
permitido). A Muralha, ao contrário, importa `calcularMuralha`/`LinhaMuralha` de `insights.ts`
(puro) — **nunca** de `getMuralha` (`/data`). Assim, quando o
placar muda via `EDITAR_PLACAR`, um único recompute propaga para toda a tela sem duplicar
nenhuma regra de negócio. Identidade do lado ramifica por `ehCompetitivo` (true = escudo;
false = pessoa/foto), **nunca** por truthiness de clube (lição `arena-placar`). W.O. na
Muralha é gateado em `m.wo` (não em `wo_vencedor` cru — residual zera clean sheet; lição
`arena-muralha`).

## Decisão 4 — Placar interativo sem cruzar a fronteira RSC

O clímax é o `MatchScoreModal` **CRU** (`src/features/match/components/MatchScoreModal.tsx`),
nunca o `MatchScoreModalConnected`. Assinaturas reais confirmadas no código (não inventar):
- `onSave` recebe **placar E autores num ÚNICO callback**:
  `onSave({ matchId, placar_1, placar_2, autores? })` (autores é `AutorGolInput[]`). Não há
  trigger separado de autores → o `DemoScoreModal` despacha `EDITAR_PLACAR` **e**
  `REGISTRAR_AUTORES` a partir desse único callback.
- A captura de autores é **gateada em `vagaId1`/`vagaId2` truthy** (`mostrarAutores =
  Boolean(vagaId1) || Boolean(vagaId2)`). → O adapter **seta `vagaId1`/`vagaId2` sintéticos
  não-nulos** (ids do lado), senão não há autores editáveis. `carregarSugestoes` real é
  `(vagaId: string) => Promise<string[]>` → o adapter retorna `Promise.resolve([...nomes])`.
  `autoresIniciais: AutorInicial[]` pré-carrega o modal (lado/jogador/gols/contra).
- **Toast honesto:** o ramo com `onSave` mostra `toast.success('Placar salvo.')` — que sugere
  persistência real. O `onSave` do demo faz o dispatch e o próprio adapter exibe um toast de
  demonstração adequado (ex.: "Placar atualizado na demonstração"), alinhado à honestidade de
  escopo — nunca implicar persistência real.

O **gatilho é SEMPRE por STRING** (`triggerLabel`/`triggerAriaLabel`/`triggerClassName`) —
**nunca** um `<Button>` JSX de client-component atravessando a fronteira RSC, que corrompe o
elemento e some sem erro (lição `arena-fix-editar-placar-rsc`/`e559a9f`). Como o demo já é
client, o risco é menor, mas a regra é mantida por consistência e para quando a View for
montada a partir de um wrapper server.

`StandingsTable` com `expansivel=true` depende do contexto de densidade de
`ClassificacaoResponsiva` — SEMPRE dentro dela, senão o contexto quebra (lição registrada no
recon). `BracketView` é RSC puro com guard para lista vazia — reuso direto.

## Decisão 5 — Perfil fictício = só permissões de INTERFACE

`DemoPerfilSelector` guarda no store um de `visitante | tecnico | gestor | admin`. As flags
reais (`podeGerir`/`podeModerar`) são **server-only assíncronas** (RPC Supabase) e quebram no
client → **não reusar**. `store/perfil.ts` reimplementa flags **locais e síncronas** derivadas
do perfil fictício, cobrindo o conjunto real de gates (grep: 128 `podeGerir`, 29
`podeArbitrar`, 18 `podeModerar`…): `podeGerir`, `podeModerar`, `podeArbitrar`, `podeReabrir`,
`podeVerBastidores`, `podeAvancar`, `podeFechar`. Essas flags são passadas por **prop** aos
componentes presentacionais (que já aceitam boolean) — **nunca** cria sessão, nunca chama
endpoint, nunca muda dados. Um chip permanente no `DemoRibbon`/`DemoNav` identifica o perfil
simulado. Como toda a gestão do demo é read-only rotulada, ações de ciclo de vida/gestão
aparecem via `ReadOnlyBanner` + controles desabilitados com explicação clara ("Disponível no
Goliseu real"), nunca acionando nada.

## Decisão 6 — Não reconstruir o que é presentacional; reconstruir o que é acoplado

- **Reuso direto** (por props): `StandingsTable`, `ClassificacaoResponsiva`,
  `DestaquesClassificacao`, `FormaBadges`, `BracketView`, `CelebracaoTitulo`,
  `TournamentTabs`, `ArtilhariaRanking`/`MuralhaRanking`/`RankingExpansivel`,
  `StatusPill`/`SeasonStatusPill`/`CupStatusPill`, `ChampionshipBadge`, `RuleListEditor`,
  átomos `TeamCrest`/`UserAvatar`, toda a árvore presentacional dos perfis
  (Hero/Forma/Agregados/Conquistas/HallDaFama/Timeline).
- **Reconstruído no namespace demo** (porque o original acopla action/Realtime, OU é um
  componente inline não exportado): `DemoMatchCard` (não reusar `MatchCard`/`*Connected`/
  `Live*`), `DemoScoreModal`, `DemoConfrontoDiretoPanel`/`DemoConfrontoTecnicosPanel` (a
  server action vira `confrontoDireto()` puro; o `ConfrontoResultado` inline é
  reimplementado), `CardVitrineDemo` (o `CardVitrine`/`VitrineVazia` são inline em
  `explorar/page.tsx`), e os equivalentes inline das pages de copa
  (`VisualizacaoTorneio`/`ClassificacaoFinal`/`CartaoCopa`). **NÃO** refatorar as pages de
  produção — o diff de produção fica mínimo (só o link de login + o override de lint).

## Decisão 7 — Fixtures offline de verdade (zero rede em assets)

`TeamCrest`/`UserAvatar` usam `next/image` apontando para o Storage real via
`NEXT_PUBLIC_SUPABASE_URL`. Para garantir **zero rede**, todos os fixtures usam
`escudoUrl: null` / `avatarUrl: null` → caem no fallback de iniciais (monograma + cor
estável), 100% offline. Se algum lado quiser escudo colorido, usar data-URI/SVG inline
local — nunca a URL do Storage.

## Decisão 8 — Escopo faseado (MVP primeiro, incrementos depois), gestão read-only

- **MVP (maior valor/menor atrito):** shell `/demo` (layout+nav+provider+ribbon); UM torneio
  de liga completo (`/demo/torneios/[id]`) com classificação/destaques/artilharia/Muralha
  derivados ao vivo; **placar interativo** recomputando a tabela; `BracketView` de um
  mata-mata com celebração; HUB `/demo` com `DemoMatchCard`; UM perfil de competidor
  read-only; Explorar com filtro client.
- **Completo (incrementos):** pirâmide multi-divisão com zonas; copas (RuleListEditor +
  derivarPool + edição grupos+bracket); perfil de técnico + confrontos; gestão de torneios
  (criar/excluir/status/buscar/filtrar/ordenar); paginação/estados vazios da vitrine; e — se
  sobrar fôlego — avançar fase do mata-mata via motor puro + celebração.
- **Read-only rotulado ou fora:** todo ciclo de vida/gestão, wizards de criação,
  cores/equipe, compartilhamento/OG (rotas `/imagem` auth-gated), auth (login/logout). Nunca
  chamam nada real.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Import server-only vaza pro bundle demo | Guard duplo: lint escopado + teste de grafo de imports |
| `StandingsTable expansivel` fora do contexto de densidade quebra | SEMPRE dentro de `ClassificacaoResponsiva` (ou `expansivel=false`) |
| `<Button>` JSX no gatilho do modal some na fronteira RSC | Gatilho SEMPRE por STRING (`triggerLabel`/`triggerClassName`) |
| Identidade por truthiness de clube quebra lado avulso | Ramificar por `ehCompetitivo` |
| `wo_vencedor` residual sem `m.wo` zera clean sheet | Fixtures com `m.wo` consistente; Muralha gateada em `m.wo` |
| Assets buscando Storage real = rede | `escudoUrl`/`avatarUrl` = `null` → fallback iniciais |
| `localStorage` suja estado entre visitas | Chave versionada `goliseu:demo:v1` + botão reset |
| Enfraquecer rotas privadas ao "liberar /demo" | PROIBIDO tocar matcher/`PROTECTED_PREFIXES`; `/demo` já é público |
| Fixtures grandes incham o bundle client | Turno único, volumes moderados; derivar, não pré-computar |

## Decisão 9 — Ajustes finais verificados no código (F, G, H, I, J)

- **F — CRUD completo de torneios:** além de `CRIAR_TORNEIO`/`EXCLUIR_TORNEIO`/`MUDAR_STATUS`,
  o reducer inclui **`EDITAR_TORNEIO`** (renomear / alterar formato de um torneio existente),
  com dialog na lista no mesmo padrão de criação. Criar/editar/excluir/mudar-status são as
  quatro operações distintas pedidas.
- **G — Fixtures cobrem o espectro:** (a) ao menos um cenário de **alerta/aviso** visível
  (W.O. travado / disciplina / pendência que exige atenção); (b) **variedade temporal**
  (datas recentes vs. antigas em torneios/partidas) para exercitar ordenação e leitura
  temporal; (c) status **`inativo`** distinto (rascunho/arquivado) além de
  ativo/concluído/pendente; (d) **volume real** para **paginação** — lista de torneios E
  vitrine com itens suficientes, e **paginação também na lista de torneios** (não só na
  vitrine).
- **H — Hidratação SSR sem mismatch:** o `DemoProvider` semeia pelo **fixture determinístico**
  e re-hidrata do `localStorage` num **`useEffect` pós-mount** (nunca lazy-init do
  `useReducer` lendo `localStorage`, que o servidor não tem → mismatch). Um flag `hidratado`
  evita gravar antes de ler.
- **I — Dashboards/indicadores explícitos:** um painel de indicadores no HUB (`/demo`) e a aba
  "Números" do torneio têm cenário próprio na spec — não implícitos.
- **J — Gate reforçado além do grafo estático:** o grafo prova ausência de *import*, não de
  *request* em runtime. No gate/validação visual (375/768/1366), checar o **painel de network**
  do browser confirmando **zero fetch/rede** num fluxo real do `/demo` e observar o **peso do
  bundle client** (fixtures + árvore client) — sem orçamento numérico rígido, mas sem inchar.
