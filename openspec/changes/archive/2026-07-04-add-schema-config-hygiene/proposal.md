## Why

Frente de HARDENING, primeira change (a mais leve): três correções de HIGIENE
apontadas nas auditorias e no grounding do código. NENHUMA muda o banco APLICADO,
não há DDL para o dono aplicar e não há ação do dono — duas são cosméticas (código
morto / classificação de dependência) e apenas UMA altera comportamento em runtime
(a superfície do Image Optimizer, hoje um proxy semiaberto).

1. **Policy `matches_update_participant` DUPLICADA em `supabase/schema.sql`.** O
   arquivo (fonte de verdade, aplicado de cima para baixo) tem DUAS definições da
   mesma policy: um bloco AMPLO no meio do schema (permite UPDATE para
   participante_1/2 E para o técnico/dono da vaga via subquery em
   `tournament_slots`) e um bloco ESTREITO na seção "PROPOSTA DE RESULTADO COM FOTO"
   (só participante_1/2, com o comentário "técnico de vaga não escreve direto"). Como
   o segundo `drop policy … create policy …` roda DEPOIS, num apply completo o estado
   vigente é o ESTREITO — o bloco AMPLO é CÓDIGO MORTO que só confunde a leitura e
   arrisca divergência num apply parcial. Achado na auditoria 2 (`schema.sql` com
   policy duplicada).

2. **`shadcn` e `tw-animate-css` em `dependencies` (deveriam ser `devDependencies`).**
   `shadcn` (^4.8.3) é o CLI de scaffold — gera código, não é importado em runtime
   por nenhum arquivo de `src/`. `tw-animate-css` (^1.4.0) é CSS de build-time
   (`@import "tw-animate-css"` em `src/app/globals.css`), não um módulo JS de runtime.
   Ambos infam a superfície de produção (achado da auditoria: "shadcn em deps").

3. **`images.remotePatterns` com wildcard `*.supabase.co`.** O Image Optimizer do
   Next hoje aceita otimizar imagem de QUALQUER projeto Supabase (proxy semiaberto:
   `hostname: "*.supabase.co"`). O app só serve avatares do PRÓPRIO projeto, cujo host
   vem de `NEXT_PUBLIC_SUPABASE_URL` — a MESMA fonte que a CSP (`src/lib/security/csp.ts`)
   já usa no `img-src`. Achado da auditoria 2 ("remotePatterns `*.supabase.co`").

## What Changes

- **Dedupe cosmético (sem DDL).** Remover o bloco AMPLO de `matches_update_participant`
  (o `drop policy` + `create policy` amplo) e o comentário adjacente; PRESERVAR o bloco
  ESTREITO da seção "PROPOSTA DE RESULTADO COM FOTO" como definição ÚNICA e
  autoritativa. Como o estreito já vence num apply completo, o banco APLICADO NÃO muda
  e não há SQL para o dono rodar. A semântica APLICADA (participante_1/2 escreve em
  partida liberada; técnico escreve via o fluxo de proposta com foto, não por UPDATE
  direto) permanece byte-a-byte a mesma.
- **Classificação de dependências (sem mudança de comportamento).** Mover `shadcn` e
  `tw-animate-css` de `dependencies` para `devDependencies` em `package.json` e
  reconciliar o `pnpm-lock.yaml` (apenas a seção do importer muda; sem bump de versão,
  sem re-resolução de transitivas). O `@import` do `tw-animate-css` segue resolvendo no
  build (Tailwind/PostCSS rodam em build-time, coberto por devDependencies).
- **Image Optimizer restrito ao host EXATO do projeto (única mudança de comportamento).**
  Em `next.config.ts`, derivar host/porta/protocolo de `env.NEXT_PUBLIC_SUPABASE_URL`
  (trocando o `import "./src/lib/env"` por side-effect por `import { env } …`, mantendo
  o parse eager fail-fast) e substituir o objeto `*.supabase.co` de `remotePatterns` por
  `{ protocol, hostname, port?, pathname: "/storage/v1/object/public/**" }`. Cobre prod
  (`<ref>.supabase.co`) E dev local (`127.0.0.1:54321`, que o wildcard atual NÃO cobria
  — o fix ainda conserta o avatar no dev), sem hardcodar o ref. O bloco
  `media.api-sports.io` (escudos de clube) permanece intacto.

## Capabilities

### Modified Capabilities
- `security-headers`: o Image Optimizer passa a aceitar apenas o host EXATO do projeto
  Supabase (derivado do env), fechando o proxy semiaberto de `*.supabase.co`.
- `data-model`: `supabase/schema.sql` (fonte de verdade) passa a ter definição ÚNICA da
  policy `matches_update_participant` — sem duplicata/código morto.

### New Capabilities
<!-- Nenhuma. -->

## Impact

- **Código de aplicação:**
  - `next.config.ts` — `import { env }` nomeado + `const supabaseUrl = new URL(...)` +
    objeto de `remotePatterns` derivado do env (host exato). Nenhuma outra rota afetada.
  - `package.json` / `pnpm-lock.yaml` — `shadcn` e `tw-animate-css` para
    `devDependencies` (move puro, sem bump).
- **Banco de dados:** `supabase/schema.sql` — REMOÇÃO do bloco AMPLO duplicado da policy
  (código morto). **ZERO DDL para o dono aplicar**: o estado APLICADO já é o do bloco
  estreito; a edição é cosmética na fonte de verdade. Nenhuma outra mudança de schema.
- **Segurança/autorização:** a superfície do Image Optimizer diminui (host exato em vez
  de wildcard). A RLS APLICADA não muda (dedupe cosmético). Nota: o texto do requirement
  `row-level-security` ("Escrita restrita ao dono da partida") descreve o caminho do
  técnico de vaga por UPDATE direto, que a policy ESTREITA aplicada (vigente desde a
  feature de proposta com foto) já não concede; reconciliar aquele texto com a política
  estreita é um FOLLOW-UP SEPARADO (mudança de descrição, não desta higiene), pois esta
  change não altera o comportamento aplicado.
- **Dependências:** nenhuma nova; duas reclassificadas para dev.
- **Testes:** a suíte atual permanece integralmente VERDE (nenhuma mudança de
  comportamento de runtime além da restrição de host do otimizador, que não tem teste
  unitário — é config do Next validada no build). Gate: typecheck + lint + test + build,
  igual ao baseline.
