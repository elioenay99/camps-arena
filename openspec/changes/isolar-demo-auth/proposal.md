## Why

O modo público `/demo` é anunciado (README e na própria change `add-modo-demo-publico`)
como **100% em memória, sem sessão e sem chamadas de rede**. A subárvore de componentes
cumpre isso — mas o **middleware** não. `src/proxy.ts` chama `updateSession()` em toda
rota que passa pelo matcher, incluindo `/demo/*`, e `updateSession` faz
`supabase.auth.getUser()` (round-trip ao Supabase Auth) a cada navegação. Ou seja: um
visitante deslogado navegando pela vitrine dispara uma chamada de rede ao Supabase por
página — tornando a afirmação do README **literalmente falsa** e adicionando latência
inútil justamente na superfície de conversão.

Um visitante de `/demo` não tem sessão para renovar: o `getUser()` sempre volta vazio e
nunca redireciona (`/demo` não é rota protegida). O refresh é puro desperdício. Esta
change **isola o `/demo` do refresh de sessão**: o proxy passa a pular `updateSession`
em `/demo` e `/demo/*`, preservando **idênticos** o `x-nonce` no request interno e o
`content-security-policy` na resposta. As demais rotas seguem exatamente como hoje.

Como consequência, dois textos que hoje descrevem uma intenção passam a ser verdade e são
alinhados: a copy dos perfis fictícios (`DESCRICAO_PERFIL`) e a seção "Demonstração" do
README.

**Decisões travadas (não reabrir):**
1. **ZERO-DDL.** Nenhuma tabela, coluna (`version`), função, policy ou migration.
2. **Matcher intocado.** `/demo` CONTINUA passando pelo proxy — ele PRECISA do
   nonce/CSP. Não se remove `/demo` do matcher; muda-se só o corpo de `proxy()`.
3. **`PROTECTED_PREFIXES` e rotas privadas intocados.** `/dashboard`, `/atualizar-senha`,
   `/login`, `/cadastro` seguem idênticos; não-logado em rota protegida segue redirecionado.
4. **Placar da demo continua livre.** A edição de placar é o clímax da demo e é aberta a
   todos os perfis DE PROPÓSITO — esta change não adiciona gating a `DemoMatchCard`/
   `DemoScoreModal`, nem move a checagem de proposta pendente para RPC.

## What Changes

- **`src/proxy.ts`** — ramifica a montagem da resposta por rota. O nonce e a CSP são
  calculados UMA vez (bloco existente). Para `/demo` e `/demo/*` (limite de segmento
  correto: `pathname === "/demo" || pathname.startsWith("/demo/")`), monta uma resposta
  direta espelhando o `nextWithHeaders()` de `middleware.ts` (clona `request.headers`,
  seta `x-nonce` + `content-security-policy` nos request headers internos,
  `NextResponse.next({ request: { headers } })`) e seta a CSP na resposta — **sem** tocar
  o Supabase. Para as demais rotas, o caminho atual (`await updateSession(...)` + CSP na
  resposta) permanece intacto.

- **`src/features/demo/store/perfil.ts`** — alinha `DESCRICAO_PERFIL` à realidade (o
  placar é editável por todos na demo). `visitante` e `tecnico` deixam de dizer "só
  visualiza". Flags e `flagsDoPerfil` **não** mudam — só a copy.

- **`README.md`** — a seção "Demonstração" passa a afirmar corretamente que nem a árvore
  de componentes nem o middleware consultam o Supabase em `/demo`.

- **Testes** — adiciona cobertura de RUNTIME de `proxy()` (mockando
  `@/lib/supabase/middleware`) confirmando que `/demo` e `/demo/*` NÃO chamam
  `updateSession` mas recebem CSP, e que `/dashboard`, `/atualizar-senha` e rotas que só
  compartilham prefixo (`/demonstration`, `/demo-extra`) CONTINUAM chamando
  `updateSession`. O teste de regex do matcher (`src/proxy.test.ts`) permanece intacto.

## Impact

- **Specs:** `public-demo` (ADDED requirement — garantia de que o middleware não renova
  sessão nem chama Supabase em `/demo`).
- **Código (alterado):** `src/proxy.ts`, `src/features/demo/store/perfil.ts`, `README.md`,
  testes de runtime do proxy. **Intocados:** `src/lib/supabase/middleware.ts`
  (`PROTECTED_PREFIXES`, `updateSession`), o matcher e `src/proxy.test.ts`, banco, Server
  Actions, `DemoMatchCard`/`DemoScoreModal`.
- **Risco:** baixo. A mudança é uma ramificação de caminho no proxy; a garantia
  observável de `/demo` (nonce + CSP) é preservada e coberta por teste, e o
  comportamento das rotas protegidas fica idêntico (também coberto por teste).
