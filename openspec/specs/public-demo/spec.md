# public-demo Specification

## Purpose
TBD - created by archiving change add-modo-demo-publico. Update Purpose after archive.
## Requirements
### Requirement: Modo demonstração público e sem sessão em `/demo`

O sistema SHALL oferecer uma subárvore pública `/demo/*` acessível SEM autenticação, que
apresenta o produto de forma navegável e interativa. As páginas `/demo/*` SHALL renderizar
sem cookies, sem sessão e sem qualquer chamada a Supabase, Server Actions ou rede. O acesso a
`/demo` NÃO SHALL criar sessão nem persistir nada em servidor. As rotas privadas do produto
(`/dashboard/*`, `/atualizar-senha`) SHALL continuar exigindo autenticação exatamente como
antes — esta change NÃO SHALL alterar `src/lib/supabase/middleware.ts` (`PROTECTED_PREFIXES`),
`src/proxy.ts` (matcher) nem `src/proxy.test.ts`.

#### Scenario: Visitante deslogado acessa a demonstração
- **WHEN** um visitante sem sessão navega para `/demo`
- **THEN** o HUB da demonstração carrega normalmente, sem redirecionar para login e sem nenhuma requisição a Supabase/rede

#### Scenario: Rotas privadas seguem protegidas
- **WHEN** um visitante sem sessão navega para `/dashboard`
- **THEN** ele continua sendo barrado/redirecionado para login (o comportamento das rotas privadas não muda)

#### Scenario: Demonstração não abre sessão
- **WHEN** o visitante interage com qualquer controle dentro de `/demo`
- **THEN** nenhuma sessão é criada e nenhum cookie de autenticação é definido

### Requirement: Isolamento arquitetural verificável no CI

A árvore `/demo` (`src/app/demo/**` e `src/features/demo/**`) NÃO SHALL importar
`@/actions/*`, `@/lib/supabase/*`, fetchers `@/features/*/data/*`, componentes `*Connected`,
nem `Live*`/`LiveMatchesProvider` **de runtime**. Esse isolamento SHALL ser garantido por DOIS
mecanismos automáticos: (a) uma regra ESLint `no-restricted-imports` escopada às pastas do
demo, proibindo esses paths com mensagem explicativa, com `allowTypeImports` habilitado para
`@/features/*/data/*`, `@/lib/supabase/*` e `database.types` (type-imports são apagados na
compilação e são client-safe); e (b) um teste TYPE-AWARE que faz o parse do grafo de imports
estáticos a partir de `src/app/demo` + `src/features/demo`, descartando imports type-only, e
FALHA se o fecho transitivo de RUNTIME alcançar `src/actions`, `src/lib/supabase` ou qualquer
`src/features/*/data`. O demo SHALL reusar apenas componentes presentacionais (dados por props,
que podem type-importar tipos dessas camadas) e motores puros zero-IO (`computeStandings`,
`insights`, `coachStats`, `championshipTheme`, `gerarChaveMataMata`, `gerarFaseDeGrupos`,
`cup/derivacao`), reconstruindo no namespace demo o agregador de artilharia (que só existe em
`/data`).

#### Scenario: Lint barra import de runtime proibido no demo
- **WHEN** um arquivo sob `src/app/demo` ou `src/features/demo` faz um import de RUNTIME de `@/actions/*`, `@/lib/supabase/*`, um fetcher `@/features/*/data/*`, um `*Connected` ou um `Live*`
- **THEN** o ESLint falha com mensagem explicando que a árvore do demo é isolada

#### Scenario: Lint permite type-import client-safe
- **WHEN** um arquivo do demo faz `import type` de um tipo em `@/features/*/data/*` ou `database.types`
- **THEN** o ESLint não acusa (o type-import é apagado na compilação)

#### Scenario: Teste de grafo pega vazamento transitivo
- **WHEN** o fecho transitivo dos imports de `/demo` passa a alcançar `src/actions`, `src/lib/supabase` ou `src/features/*/data`
- **THEN** o teste de grafo de imports falha, mesmo que o import direto não viole o lint

### Requirement: Estado local reiniciável com persistência versionada

Todo o estado da demonstração SHALL viver em memória num provider client
(Context + `useReducer`), semeado por fixtures. A persistência SHALL ser apenas local
(`localStorage`) sob uma chave VERSIONADA (`goliseu:demo:v1`), de modo que uma mudança de
versão invalide seeds antigos. O sistema SHALL oferecer um botão "Reiniciar demonstração" que
descarta o estado atual e recarrega o seed. Nenhuma mutação da demonstração SHALL persistir em
servidor ou fazer requisição de rede.

#### Scenario: Reiniciar recupera o seed
- **WHEN** o visitante alterou placares/torneios e toca "Reiniciar demonstração"
- **THEN** o estado volta exatamente ao seed dos fixtures

#### Scenario: Chave versionada invalida estado antigo
- **WHEN** existe estado salvo sob uma versão de chave diferente da atual
- **THEN** o estado antigo é ignorado e o seed atual é carregado (sem tela quebrada)

### Requirement: Interface global permanente de modo demonstração

Todas as páginas `/demo` SHALL exibir, de forma permanente e visualmente distinta do app real,
uma faixa com o texto "Modo demonstração — todos os dados são fictícios e nenhuma alteração
será enviada ao sistema real.", além dos botões "Reiniciar demonstração" e "Entrar e usar o
Goliseu" (link para `/login` ou `/cadastro`). A demonstração NÃO SHALL reutilizar o menu de
conta real (`AccountMenu`) nem qualquer ação de logout; o CTA de conta SHALL ser estático.

#### Scenario: Faixa de demonstração sempre visível
- **WHEN** o visitante está em qualquer rota `/demo/*`
- **THEN** a faixa "dados fictícios" e os botões de reiniciar/entrar estão visíveis e o modo é visualmente distinto do app real

### Requirement: Placar interativo recomputa a competição ao vivo

A demonstração SHALL permitir editar o placar de uma partida através do `MatchScoreModal` CRU
(nunca o `*Connected`), com o gatilho passado por STRING (`triggerLabel`/`triggerClassName`),
nunca por elemento `<Button>` JSX. Ao salvar um placar, o sistema SHALL recomputar AO VIVO —
pelos motores puros, sem duplicar regras — a classificação, a forma, os destaques, a Muralha
(clean sheets) e a artilharia. A identidade de cada lado SHALL ramificar por `ehCompetitivo`
(escudo × pessoa/foto), nunca por truthiness de clube. O W.O. na Muralha SHALL ser gateado em
`m.wo`, nunca em `wo_vencedor` cru.

#### Scenario: Editar placar move a tabela
- **WHEN** o visitante edita o placar de uma partida em andamento e salva
- **THEN** a classificação, a forma, os destaques e a Muralha refletem o novo resultado imediatamente, sem recarregar a página e sem rede

#### Scenario: Autores de gol atualizam a artilharia
- **WHEN** o visitante registra/corrige autores de gol de um lado (respeitando o teto = placar do lado)
- **THEN** o ranking de artilharia recomputa considerando os novos autores

#### Scenario: Salvar não envia nada ao servidor
- **WHEN** o visitante salva um placar na demonstração
- **THEN** nenhuma requisição de rede/Server Action é feita; a mudança fica apenas no estado local

### Requirement: Painel de indicadores/dashboards na demonstração

A demonstração SHALL exibir um painel de indicadores/dashboards — no HUB (`/demo`) e na aba
"Números" do torneio — com métricas agregadas derivadas do estado local (ex.: total de
torneios/partidas/gols, destaques do momento). Os indicadores SHALL recomputar quando o estado
local muda (ex.: após editar um placar), sem rede.

#### Scenario: HUB mostra indicadores agregados
- **WHEN** o visitante abre `/demo`
- **THEN** um painel de indicadores com métricas agregadas dos dados fictícios é exibido

#### Scenario: Indicadores recomputam após mudança local
- **WHEN** o visitante edita um placar que altera um agregado (ex.: total de gols)
- **THEN** o painel de indicadores reflete o novo valor sem recarregar a página

### Requirement: Gestão de torneios simulada no estado local

A lista de torneios da demonstração SHALL suportar busca, filtro por status, ordenação,
paginação, estado vazio, criação, edição (renomear / alterar formato), exclusão (com
confirmação) e mudança de status — todas operando exclusivamente sobre o estado local, sem
tocar banco ou rede. A exclusão SHALL exigir confirmação explícita.

#### Scenario: Criar torneio afeta só o estado local
- **WHEN** o visitante cria um torneio na demonstração
- **THEN** o novo torneio aparece na lista local e nada é gravado no banco

#### Scenario: Editar torneio afeta só o estado local
- **WHEN** o visitante renomeia ou altera o formato de um torneio existente na demonstração
- **THEN** a alteração reflete na lista local e nada é gravado no banco

#### Scenario: Excluir pede confirmação e não afeta o banco
- **WHEN** o visitante toca excluir num torneio da demonstração
- **THEN** uma confirmação é exigida e, ao confirmar, o torneio some apenas do estado local

#### Scenario: Buscar/filtrar/ordenar sem estado vazio quebrado
- **WHEN** o visitante busca/filtra por um critério sem resultados
- **THEN** um estado vazio claro é exibido (sem erro)

### Requirement: Confronto direto interativo por motor puro

Os perfis de competidor e de técnico da demonstração SHALL oferecer um seletor de confronto
direto que, ao escolher um adversário, calcula o retrospecto via a função pura
`confrontoDireto()` sobre os fixtures — NUNCA via Server Action ou rede.

#### Scenario: Selecionar adversário calcula o retrospecto localmente
- **WHEN** o visitante escolhe um rival no picker de confronto direto de um perfil
- **THEN** o retrospecto do confronto é exibido, derivado dos fixtures pela função pura, sem nenhuma requisição

### Requirement: Explorar/vitrine client-side

A página Explorar da demonstração SHALL oferecer busca, filtro, ordenação, paginação, estado
vazio e um toggle "listar" otimista, tudo operando client-side sobre os fixtures da vitrine,
sem rede.

#### Scenario: Filtrar e paginar a vitrine sem rede
- **WHEN** o visitante busca/filtra/ordena/pagina a vitrine da demonstração
- **THEN** os resultados são recalculados client-side sobre os fixtures, sem nenhuma requisição

#### Scenario: Toggle listar é otimista e local
- **WHEN** o visitante alterna "listar" um item da vitrine
- **THEN** o estado do item muda imediatamente no estado local, sem chamar nada real

### Requirement: Perfil fictício simula apenas permissões de interface

A demonstração SHALL oferecer um seletor de perfil fictício
(`visitante | tecnico | gestor | admin`) que altera SOMENTE a visibilidade/habilitação de
controles de gestão na interface (flags `podeGerir`/`podeModerar`). Trocar de perfil NÃO SHALL
criar sessão, autenticar, nem chamar endpoint. O perfil simulado SHALL ser identificado
permanentemente (chip no ribbon/nav).

O gate `podeGerir` SHALL ser aplicado de forma CONSISTENTE em TODAS as telas da demonstração
que expõem ações de gestão — incluindo a lista de Torneios e a página Explorar. Em nenhuma
tela um perfil sem `podeGerir` (ex.: "visitante" ou "tecnico") SHALL enxergar controles de
criação, edição, exclusão, mudança de status ou toggle de listagem.

#### Scenario: Perfil gestor revela controles de gestão (desabilitados/rotulados)
- **WHEN** o visitante troca para o perfil "gestor"
- **THEN** os controles de gestão aparecem conforme a permissão simulada, sem que nenhuma sessão seja criada

#### Scenario: Perfil visitante esconde ações de gestão
- **WHEN** o visitante troca para "visitante"
- **THEN** as ações de gestão ficam ocultas/desabilitadas, sem chamar nada real

#### Scenario: Lista de torneios esconde gestão para quem não pode gerir
- **WHEN** o perfil ativo é "visitante" ou "tecnico" (sem `podeGerir`) na lista de Torneios da demonstração
- **THEN** os controles "Criar torneio", "Editar", "Excluir" e o select "Mudar status" ficam ocultos

#### Scenario: Explorar esconde o toggle de listagem para quem não pode gerir
- **WHEN** o perfil ativo é "visitante" ou "tecnico" (sem `podeGerir`) na página Explorar da demonstração
- **THEN** o toggle "listar" de cada card fica oculto (o card permanece read-only)

#### Scenario: Perfil gestor/admin mantém o toggle de listagem
- **WHEN** o perfil ativo tem `podeGerir` (ex.: "gestor" ou "admin") na página Explorar
- **THEN** o toggle "listar" de cada card permanece disponível e alterna o estado local otimista

### Requirement: Gestão e ciclo de vida read-only rotulado

A demonstração SHALL apresentar as funcionalidades de ciclo de vida e gestão como read-only
rotulado (desabilitadas com explicação clara) ou simplesmente não as apresentar, NUNCA
acionando nada real. Isso abrange iniciar/encerrar/reabrir, liberar rodadas, montar
temporada/playoffs, confirmar fluxo sobe/cai, disciplina de W.O., os wizards de criação de
torneio/liga/copa, edição de cores/equipe, compartilhamento e cards OG, e auth
(login/logout).

#### Scenario: Controle de gestão desabilitado explica o porquê
- **WHEN** o visitante encontra um controle de ciclo de vida/gestão na demonstração
- **THEN** ele aparece desabilitado com um rótulo claro (ex.: "Disponível no Goliseu real"), sem acionar nenhuma ação real

### Requirement: Fixtures fictícios sem rede em assets

Os dados da demonstração SHALL vir exclusivamente de fixtures em memória. Escudos e avatares
dos fixtures SHALL usar `escudoUrl: null` / `avatarUrl: null` para cair no fallback de
iniciais, garantindo zero requisição ao Storage real; qualquer escudo colorido SHALL usar
recurso local (data-URI/SVG inline), nunca a URL do Storage. Os fixtures SHALL declarar apenas
o material bruto (`PartidaCronologica[]` + identidades) e a UI SHALL derivar
classificação/forma/destaques/Muralha/artilharia/zonas/confronto pelos motores puros, sem
duplicar regras de W.O./promédio/desempate.

#### Scenario: Avatares/escudos usam fallback offline
- **WHEN** a demonstração renderiza identidades sem URL de escudo/avatar
- **THEN** o fallback de iniciais é exibido, sem nenhuma requisição ao Storage

### Requirement: Params inválidos não acessam dados reais

A demonstração SHALL exibir um estado de "não encontrado" ou fallback vazio quando uma rota
dinâmica do demo receber um identificador inexistente ou manipulado, SEM realizar nenhum fetch
ou acesso a dados reais. Isso vale para `/demo/torneios/[id]`, `/demo/ligas/[id]`,
`/demo/copas/[id]` e as rotas de perfil.

#### Scenario: Id inexistente cai em fallback sem fetch
- **WHEN** o visitante navega para `/demo/torneios/<id-inexistente>`
- **THEN** um estado de "não encontrado"/vazio é exibido sem nenhuma requisição de dados reais

### Requirement: Ponto de entrada da demonstração no login

A tela de login (`src/app/login/page.tsx`) SHALL oferecer um link "Ver demonstração" que
navega para `/demo`. Essa SHALL ser a única mudança de comportamento em superfície de produção
além do override de lint do guard.

#### Scenario: Link "Ver demonstração" no login
- **WHEN** um visitante está na tela de login
- **THEN** existe um link "Ver demonstração" que leva a `/demo`

### Requirement: Acessibilidade e responsividade da demonstração

As páginas `/demo` SHALL ser acessíveis e responsivas: sem overflow horizontal em 375/768/1366
px, alvos de toque ≥44px, navegação por teclado, nomes acessíveis nos controles, foco correto
nos modais, contraste adequado e estados de carregamento/vazio/erro tratados. Ações destrutivas
(excluir) SHALL exigir confirmação.

#### Scenario: Sem overflow horizontal no mobile
- **WHEN** a demonstração é aberta em 375px
- **THEN** nenhuma página `/demo` apresenta rolagem horizontal e os alvos de toque respeitam ≥44px

### Requirement: Middleware não renova sessão nem chama Supabase em `/demo`

O proxy (`src/proxy.ts`) SHALL aplicar `x-nonce` no request interno e
`Content-Security-Policy` na resposta para `/demo` e `/demo/*` exatamente como para
qualquer outra rota, MAS NÃO SHALL executar o refresh de sessão (`updateSession` →
`supabase.auth.getUser()`) nessas rotas — um visitante da demo não tem sessão a renovar e
`/demo` não é rota protegida. A detecção da demo SHALL usar limite de segmento
(`pathname === "/demo"` ou `pathname` iniciando com `"/demo/"`), de modo que rotas que
apenas compartilham o prefixo (ex.: `/demonstration`, `/demo-extra`) NÃO recebam o bypass.
O matcher do proxy e `PROTECTED_PREFIXES` SHALL permanecer inalterados: `/demo` continua
passando pelo proxy para receber nonce/CSP, e as rotas protegidas seguem redirecionando o
visitante não autenticado.

#### Scenario: Demo não dispara chamada ao Supabase

- **WHEN** um visitante sem sessão navega para `/demo` (ou `/demo/torneios`, `/demo/ligas`)
- **THEN** o proxy responde sem chamar `updateSession`/`supabase.auth.getUser()` e a
  resposta ainda inclui `content-security-policy` (e o request interno recebe `x-nonce`)

#### Scenario: Rotas protegidas seguem renovando sessão

- **WHEN** uma requisição chega em `/dashboard` ou `/atualizar-senha`
- **THEN** o proxy chama `updateSession`, renovando a sessão e redirecionando o visitante
  não autenticado para `/login` como antes

#### Scenario: Prefixo compartilhado não recebe o bypass

- **WHEN** uma requisição chega em `/demonstration` ou `/demo-extra`
- **THEN** o proxy trata a rota como normal e chama `updateSession` (o bypass é exclusivo
  de `/demo` e `/demo/*`)

