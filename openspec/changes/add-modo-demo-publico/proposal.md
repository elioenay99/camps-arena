## Why

O Goliseu é rico em profundidade — torneios de liga com classificação/forma/destaques,
mata-mata com celebração de campeão, pirâmides com zonas de acesso/rebaixamento, copas,
artilharia e Muralha, perfis de competidor e técnico, vitrine pública — mas **tudo isso
está atrás do login**. Um visitante que chega pela landing não consegue *sentir* o
produto: ele vê a promessa, não a experiência. O funil de conversão perde a etapa mais
persuasiva (o "aha" de mexer no placar e ver a tabela recomputar) porque não há como
tocar no app sem criar conta.

Esta change entrega um **modo público de demonstração** em `/demo/*`: uma cópia
navegável e **interativa** do produto, alimentada 100% por **dados fictícios em memória**,
que **nunca** toca o Supabase, Server Actions, Realtime ou qualquer rede. O visitante
edita placares, registra autores de gol, cria/exclui torneios, filtra a vitrine, troca de
perfil fictício e vê os mesmos motores de cálculo do app real rodarem ao vivo — sem
sessão, sem escrever nada, sem risco. O clímax é o **placar interativo**: mexer no placar
e ver classificação, forma, destaques, Muralha e artilharia recomputarem em tempo real.

A change é **ZERO-DDL** e **ZERO-mudança-de-produção-relevante**: reusa componentes
presentacionais e motores puros que já existem, sem tocar o banco, sem alterar rotas
privadas. As **únicas** mudanças fora da subárvore `/demo` são (a) um link
"Ver demonstração" na tela de login e (b) uma regra de lint que *fortalece* o isolamento.

**Decisões de produto (travadas — não reabrir):**
1. **Público e sem sessão.** `/demo` é acessível deslogado. Não cria sessão, não chama
   endpoint, não persiste nada em servidor. Trocar de "perfil fictício" simula apenas
   permissões de INTERFACE (mostra/esconde/desabilita ações de gestão) — nunca autentica.
2. **Isolamento é INEGOCIÁVEL e auditável.** A árvore `/demo` jamais importa
   `@/actions/*`, `@/lib/supabase/*`, fetchers `@/features/*/data/*`, componentes
   `*Connected`, nem `Live*`/`LiveMatchesProvider`. Isso é garantido por lint
   (`no-restricted-imports` escopado) **e** por um teste de grafo de imports — não só por
   disciplina. **Nada** é alterado em `src/lib/supabase/middleware.ts` (`PROTECTED_PREFIXES`),
   `src/proxy.ts` (matcher) ou `src/proxy.test.ts`: `/demo` já nasce público e recebe
   CSP+nonce normalmente; "liberar /demo no matcher" é PROIBIDO (enfraqueceria as rotas
   privadas).
3. **Estado local, reiniciável.** Todo o estado vive num `DemoProvider` client
   (Context + `useReducer`), semeado por fixtures, persistido em `localStorage` sob chave
   **versionada** (`goliseu:demo:v1`) com botão **"Reiniciar demonstração"** (reset ao
   seed). Nenhuma chamada de rede.
4. **Zero rede de verdade nos assets.** Escudos/avatares dos fixtures usam `url: null`
   para cair no fallback de iniciais — nunca a URL do Storage real (que seria rede).
5. **Honestidade de escopo.** Ciclo de vida/gestão (iniciar/encerrar/reabrir, liberar
   rodadas, montar temporada/playoffs, disciplina de W.O.), wizards de criação,
   cores/equipe, compartilhamento/OG e auth aparecem **read-only rotulados** (desabilitados
   com explicação) ou simplesmente não existem no `/demo` — nunca chamam nada real.

## What Changes

- **Nova subárvore pública `src/app/demo/*`** (RSC-first, folhas client onde há
  interação): HUB (`/demo`) com partidas ativas e CTA; `torneios` (lista + `[id]`);
  `ligas` (lista + `[id]` + `competidor/[id]` + `tecnico/[userId]`); `copas`
  (lista + `[id]`); `explorar` (vitrine). Um `layout.tsx` com shell
  (StadiumBackdrop + DemoNav + `DemoProvider` + faixa `DemoRibbon`) que herda
  tema/Toaster/fontes/nonce do root layout.

- **Novo feature-módulo `src/features/demo/*`**: `store/` (`DemoProvider`,
  `demoReducer`, `useDemoStore`, `perfil`), `derive/` (`derivarClassificacao` — deriva
  classificação/insights/Muralha/zonas dos motores puros), `fixtures/` (identidades,
  torneio de liga, mata-mata, pirâmide, copa, perfis, vitrine, partidas ativas, autores),
  `adapters/` (`DemoScoreModal`, `DemoMatchCard`, `DemoConfrontoDiretoPanel`,
  `DemoConfrontoTecnicosPanel`) e `components/` (`DemoNav`, `DemoRibbon`,
  `DemoPerfilSelector`, `CardVitrineDemo`, `DemoTorneioView`, `DemoLigaView`,
  `DemoCopaView`, `ReadOnlyBanner`).

- **Placar interativo** (`MatchScoreModal` CRU — nunca `*Connected`; gatilho por STRING)
  ligado a `dispatch(EDITAR_PLACAR)`: classificação, forma, destaques, Muralha e
  artilharia recomputam ao vivo pelos motores puros (`computeStandings`, `insights.ts`,
  `calcularMuralha`). Autores de gol editáveis (teto por lado = placar) atualizam a
  artilharia.

- **Gestão de torneios local** (criar / excluir com confirmação / mudar status / buscar /
  filtrar / ordenar) — tudo no reducer, nada no banco. **Confronto direto** (competidor e
  técnico) via `confrontoDireto()` puro sobre fixtures. **Explorar** com
  busca/filtro/ordenação/paginação client-side + toggle "listar" otimista.

- **Perfil fictício** (`visitante | tecnico | gestor | admin`) que simula só permissões de
  UI (`podeGerir`/`podeModerar`), com chip permanente de identificação no ribbon/nav.

- **Guard de isolamento mecânico**: regra ESLint `no-restricted-imports` escopada a
  `src/app/demo/**` e `src/features/demo/**` (proíbe `@/actions/*`, `@/lib/supabase/*`,
  fetchers, `*Connected`, `Live*`) **+** teste vitest de grafo de imports que falha se a
  subárvore `/demo` alcançar `src/actions`, `src/lib/supabase` ou fetchers de dados.

- **Único toque em produção além do lint**: link **"Ver demonstração"** →`/demo` na tela de
  login (`src/app/login/page.tsx`).

- **ZERO-DDL / ZERO-rede**: nenhuma tabela, coluna, função, policy, migration ou chamada
  Supabase. **NÃO** altera `middleware.ts`, `proxy.ts`, `proxy.test.ts`,
  `PROTECTED_PREFIXES` nem o matcher.

## Impact

- **Specs:** adiciona a capability **`public-demo`** (nova).
- **Código (novo):** `src/app/demo/**`, `src/features/demo/**`, override ESLint escopado,
  testes vitest (isolamento de grafo + fluxos demo).
- **Código (alterado, mínimo):** `src/app/login/page.tsx` (link "Ver demonstração"); config
  do ESLint (override escopado). **Intocados:** `src/lib/supabase/middleware.ts`,
  `src/proxy.ts`, `src/proxy.test.ts`, banco, Server Actions, componentes de produção.
- **Risco:** baixo — subárvore aditiva e isolada; nenhuma superfície privada muda de
  comportamento. O maior risco é *vazamento de acoplamento* (importar algo server-only),
  neutralizado pelo guard duplo (lint + teste de grafo).
