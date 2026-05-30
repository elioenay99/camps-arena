# Deploy na Vercel — Arena

Guia de publicação do Arena na Vercel com Supabase provisionado via Marketplace.

## Pré-requisitos

- Conta na Vercel com o repositório importado (framework detectado: **Next.js**, sem `vercel.json`).
- **pnpm** como gerenciador (scripts em `package.json`: `dev` / `build` / `start` / `lint`).
- O schema do banco em `supabase/schema.sql` (fonte de verdade do modelo de dados).

## 1. Provisionar o Supabase via Marketplace da Vercel

1. Vercel → seu projeto → **Integrations** (ou **Storage**) → **Marketplace** → **Supabase** → **Connect**.
2. A integração cria/conecta o projeto Supabase e **injeta automaticamente** as variáveis de ambiente nos três ambientes (Production / Preview / Development).

Variáveis tipicamente injetadas e o que a **aplicação** realmente lê:

| Variável | Usada pelo app? | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Sim** | client/server/proxy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Sim** | client/server/proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | Não (reservado) | uso administrativo futuro; bypassa RLS |
| `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_PRISMA_URL`, `POSTGRES_*` | Não | migrations/admin manuais |
| `SUPABASE_JWT_SECRET` | Não | — |

> A lista exata pode variar com o tempo — **confira no painel da Vercel** após conectar; não assuma um conjunto fixo.

## 2. Aplicar o schema MANUALMENTE (DDL não é automática)

DDL/migrations **nunca** são aplicadas automaticamente (política do projeto).

1. Supabase Dashboard → **SQL Editor**.
2. Cole o conteúdo de `supabase/schema.sql` e execute. O script é idempotente (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`) — pode ser reaplicado com segurança.
3. Confirme: tabelas `users` / `tournaments` / `matches`, view `users_public`, **RLS habilitada** e triggers (`set_updated_at`, `lock_match_relations`, `handle_new_user`).

## 3. Configurar `NEXT_PUBLIC_SITE_URL` (única env manual)

A integração **não** injeta esta variável.

- Vercel → **Settings → Environment Variables**.
- **Production**: `https://<seu-dominio-canonico>`.
- **Preview**: a URL de preview (ou derive de `VERCEL_URL` no código, se adotado).
- É a URL canônica do site, consumida como `metadataBase` (`src/app/layout.tsx`) para gerar URLs absolutas de metadados/OG. Como é **inlined em build time**, trocar o domínio exige **novo deploy** (não basta editar a env). Os redirects de auth usam caminhos relativos e não dependem dela.

## 4. Configurar o Auth no Supabase (redirects)

- Supabase Dashboard → **Authentication → URL Configuration**.
- **Site URL** = mesmo valor de `NEXT_PUBLIC_SITE_URL` de Production.
- **Redirect URLs** (allowlist): domínio de produção + padrão de preview (ex.: `https://*.vercel.app`).
- O login é SSR por cookies (o proxy renova a sessão); a rota protegida é `/dashboard`. Valide a allowlist contra o fluxo real em `src/features/auth` / `src/actions/auth.ts` para não quebrar o login em produção.

## 5. Deploy

- Push na branch conectada dispara o build (`next build`) e o deploy.
- Promoção a Production conforme a configuração de branch da Vercel.

## 6. Onde ver logs e diagnosticar

### Vercel

- **Build Logs**: erros de compilação/typecheck/lint no deploy.
- **Runtime Logs** (Functions/Logs): erros de execução em Server Components e Server Actions.
- **`error.digest`**: em produção, erros de Server Component são mascarados na UI (ver `src/app/dashboard/error.tsx`) — a tela mostra só um código (digest). Busque esse digest nos Runtime Logs para achar a stack real. Nada sensível chega ao cliente.

### Supabase

- **Logs & Analytics**: API / Auth / Postgres Logs.
- **Postgres Logs**: violações de RLS, erros de constraint (`placar >= 0`, participantes distintos) e a exceção do trigger `lock_match_relations`.

## 7. Checklist final

- [ ] Integração Supabase conectada (envs injetadas nos 3 ambientes).
- [ ] `supabase/schema.sql` aplicado no SQL Editor.
- [ ] `NEXT_PUBLIC_SITE_URL` setada em Production (e Preview).
- [ ] Auth Site URL + Redirect URLs configuradas.
- [ ] Deploy verde e `/dashboard` exige login (proxy + verificação na RSC).
