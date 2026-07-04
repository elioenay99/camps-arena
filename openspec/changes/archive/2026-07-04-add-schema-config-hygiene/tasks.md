## 0. Baseline primeiro

- [x] 0.1 Baseline HEAD `e33acf0`: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test`
  1380/1380 ✓, `pnpm build` ✓. Zero falhas pré-existentes (verde final = igual ao
  baseline).

## 1. Dedupe da policy `matches_update_participant` (cosmético, sem DDL)

- [x] 1.1 Ler `supabase/schema.sql` e confirmar as DUAS definições: bloco AMPLO
  (~`:1412-1444`, com o caminho `tournament_slots`/vaga) e bloco ESTREITO
  (~`:4954-4965`, só participante_1/2, seção "PROPOSTA DE RESULTADO COM FOTO").
- [x] 1.2 Remover o bloco AMPLO (comentário adjacente + `drop policy if exists
  matches_update_participant` + `create policy … amplo`), substituindo o comentário por
  uma nota curta de que a policy tem definição ÚNICA e ESTREITA mais abaixo.
- [x] 1.3 PRESERVAR o bloco ESTREITO intocado como fonte única. NUNCA manter o amplo (o
  estreito já vence num apply completo — dedupe não muda o banco APLICADO, sem DDL).
- [x] 1.4 Confirmar por grep: resta EXATAMENTE UM `create policy
  matches_update_participant` (o estreito).

## 2. `shadcn` + `tw-animate-css` → devDependencies (`package.json`)

- [x] 2.1 Mover `shadcn` (^4.8.3) e `tw-animate-css` (^1.4.0) de `dependencies` para
  `devDependencies` por EDIÇÃO de `package.json` (preserva ranges e transitivas).
- [x] 2.2 `pnpm install` para reconciliar o `pnpm-lock.yaml`. Confirmar que o diff do
  lockfile é APENAS a troca de seção do importer (sem bump de versão nem re-resolução de
  transitivas).
- [x] 2.3 NÃO mover `radix-ui`/`lucide-react`/`class-variance-authority`/`tailwind-merge`
  /`clsx` (runtime — ficam em `dependencies`).

## 3. Image Optimizer restrito ao host EXATO (`next.config.ts`)

- [x] 3.1 Trocar `import "./src/lib/env"` (side-effect) por `import { env } from
  "./src/lib/env"` (mantém o parse eager fail-fast).
- [x] 3.2 Antes do config: `const supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL)`.
- [x] 3.3 Substituir o objeto `*.supabase.co` em `images.remotePatterns` por
  `{ protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https", hostname:
  supabaseUrl.hostname, ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
  pathname: "/storage/v1/object/public/**" }`. NÃO hardcodar o ref.
- [x] 3.4 MANTER o bloco `media.api-sports.io` (escudos) intacto.

## 4. Gate mecânico

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — VERDE do lado do
  specialist (igual ao baseline 0.1). O orquestrador roda o gate autoritativo num pane
  irmão.
- [ ] 4.2 Revisão adversarial do diff. (ORQUESTRADOR)
- [x] 4.3 `openspec validate add-schema-config-hygiene --strict` = valid.
