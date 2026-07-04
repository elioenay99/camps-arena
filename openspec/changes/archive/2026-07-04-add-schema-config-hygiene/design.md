# Design — Higiene de schema e config

Referências `arquivo:linha` são do HEAD (`e33acf0`). As três correções são de
HIGIENE: duas cosméticas (nenhuma mudança de comportamento aplicado) e uma que
reduz a superfície do Image Optimizer. Nenhuma toca o banco APLICADO.

## 1. Dedupe da policy `matches_update_participant` (cosmético, sem DDL)

`supabase/schema.sql` tem DUAS definições da mesma policy:

- **Bloco AMPLO** (comentário + `drop policy` + `create policy`, ~`schema.sql:1412-1444`
  no HEAD): `using`/`with check` permitindo `auth.uid() = participante_1 OR
  participante_2 OR exists(select 1 from tournament_slots s where s.id in
  (matches.vaga_1, matches.vaga_2) and s.user_id = auth.uid())`, sempre sob
  `liberada_em is not null and liberada_em <= now()`. Inclui o caminho do TÉCNICO da
  vaga.
- **Bloco ESTREITO** (seção "PROPOSTA DE RESULTADO COM FOTO", ~`schema.sql:4954-4965`):
  `drop policy … create policy …` com apenas `auth.uid() = participante_1 or
  auth.uid() = participante_2` (sem o caminho da vaga/técnico), sob o mesmo gate de
  liberação. O comentário é explícito: "Estreitar matches_update_participant para
  AVULSO (técnico de vaga não escreve direto)".

Como `schema.sql` aplica de cima para baixo e o segundo `drop policy … create policy`
roda depois, num apply COMPLETO o estado vigente é o ESTREITO — o bloco AMPLO nunca
sobrevive. Ele é CÓDIGO MORTO: só arrisca divergência num apply parcial e confunde a
leitura da fonte de verdade.

**Fix:** remover o bloco AMPLO (comentário + `drop policy if exists` + `create policy`
amplo) e substituir o comentário adjacente por uma nota curta apontando que a policy
tem definição única e ESTREITA mais abaixo (seção da proposta com foto). PRESERVAR o
bloco ESTREITO intocado como fonte única.

**Armadilha crítica (por isso mantemos o ESTREITO, nunca o amplo):** manter o AMPLO
reampliaria o UPDATE de participante (readicionaria o caminho da vaga/`tournament_slots`)
e MUDARIA a semântica aplicada — exatamente o oposto do que a feature de proposta com
foto quis. Como o estreito já vence, o banco APLICADO NÃO muda com o dedupe: **não há
DDL para o dono aplicar**; é edição da fonte de verdade para eliminar a duplicata.

**Fora de escopo (follow-up):** o requirement `row-level-security` "Escrita restrita ao
dono da partida" ainda descreve o técnico de vaga escrevendo por UPDATE direto — o que a
política estreita já não concede (o técnico usa o RPC da proposta com foto). Reconciliar
aquele texto é uma mudança de DESCRIÇÃO separada; esta change não altera o comportamento
aplicado, então não mexe naquele requirement.

## 2. `shadcn` + `tw-animate-css` → `devDependencies` (sem mudança de comportamento)

- `shadcn` (^4.8.3): CLI de scaffold (`npx shadcn add …`) — gera componentes em disco,
  não é importado em `src/`. Verificado: nenhum `import … from "shadcn"` no código de
  runtime.
- `tw-animate-css` (^1.4.0): CSS de build-time, consumido por `@import "tw-animate-css";`
  em `src/app/globals.css:2`. Tailwind v4/PostCSS processam isso no BUILD (o
  `@tailwindcss/postcss` já é devDependency); o resultado é CSS estático no bundle — não
  há require de módulo JS em runtime.

**Fix:** editar `package.json` movendo as duas linhas de `dependencies` para
`devDependencies` (mantendo os ranges `^4.8.3` / `^1.4.0`) e rodar `pnpm install` para
reconciliar o `pnpm-lock.yaml`. Fazer o move por EDIÇÃO de `package.json` (não
`pnpm remove`+`add`) preserva a resolução das transitivas: o lockfile muda APENAS a seção
do importer (de `dependencies:` para `devDependencies:`), sem bump de versão nem
re-resolução da subárvore. NÃO mover `radix-ui`, `lucide-react`,
`class-variance-authority`, `tailwind-merge`, `clsx` (runtime — ficam em `dependencies`).

Validação: `pnpm build` continua resolvendo o `@import "tw-animate-css"` (gate).

## 3. Image Optimizer restrito ao host EXATO do projeto (única mudança de runtime)

Hoje `next.config.ts` (`:82-87`) tem:
```
{ protocol: "https", hostname: "*.supabase.co",
  pathname: "/storage/v1/object/public/**" }
```
O wildcard deixa o Image Optimizer (`/_next/image`) buscar/otimizar imagem de QUALQUER
projeto `*.supabase.co` — um proxy semiaberto. O único host de storage do app é o do
PRÓPRIO projeto (avatares), cujo valor vem de `NEXT_PUBLIC_SUPABASE_URL` — a mesma fonte
que `src/lib/security/csp.ts:20-21,33` já usa para montar o `img-src`.

**Fix (deriva do env, robusto para prod + local):**
- Trocar `import "./src/lib/env"` (side-effect, `:7`) por `import { env } from
  "./src/lib/env"`. O parse eager (fail-fast) continua: `env` só existe após a validação
  Zod passar; env inválida ainda derruba o build no início.
- Antes do `nextConfig`: `const supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL)`.
- Substituir o objeto do supabase em `remotePatterns` por:
  ```
  { protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
    hostname: supabaseUrl.hostname,
    ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
    pathname: "/storage/v1/object/public/**" }
  ```
- MANTER o bloco `media.api-sports.io` (escudos de clube) intacto.

Comportamento resultante: em prod, `hostname` vira `bfxmdypdxbbfedtqsqik.supabase.co`
(`https`, sem porta); em dev local, `127.0.0.1` com `port: "54321"` e `protocol: "http"`
— o wildcard atual NÃO cobria o local, então o fix ainda CONSERTA o avatar no dev. O ref
NÃO é hardcodado (deriva do env). O `.replace(":", "")` converte `"https:"`→`"https"`; o
cast estreita ao union que `remotePatterns` espera (o Zod de `env.ts` já garante
`http`/`https` via `urlHttp`).

## Riscos / pontos de atenção

- **Dedupe:** manter o bloco ERRADO (amplo) mudaria a RLS aplicada. Confirmar por grep
  que resta EXATAMENTE UM `create policy matches_update_participant` (o estreito) após a
  edição.
- **Move de deps:** garantir que o lockfile diff é só a troca de seção (sem bump de
  transitivas) e que `pnpm build` resolve o `@import` do `tw-animate-css`.
- **remotePatterns:** o `env` importado nomeadamente ainda dispara o parse eager (não
  regride o fail-fast). O build sai VERDE com o env local; a restrição é config do Next,
  validada pelo build (sem teste unitário próprio).
