# Goliseu

Gestor de campeonatos amadores de futebol de videogame. O Goliseu organiza a rotina de
uma comunidade de jogadores: pirâmides de divisões com acesso e rebaixamento, copas,
torneios avulsos (liga, mata-mata, grupos + mata-mata, fase de liga), lançamento
colaborativo de placares com aprovação, artilharia e ranking de defesas ("Muralha"),
histórico e carreira de técnicos, hall da fama e uma vitrine pública das competições.

O nome vem de "gol" + "Coliseu".

## Demonstração

Há um modo de demonstração público e interativo em `/demo`, 100% em memória: nem a árvore
de componentes nem o middleware consultam o Supabase em `/demo` — não há sessão nem
chamada de rede. É a forma mais rápida de sentir o produto sem criar conta: edite um
placar e veja classificação, forma, artilharia e Muralha recomputarem ao vivo.

## Stack

- **Next.js 16** (App Router, React 19, diretório `src/`)
- **TypeScript** com `strict` ativado
- **Tailwind CSS v4**
- **shadcn/ui** (base Radix) + **next-themes** (dark é o padrão; light disponível)
- **Supabase** — PostgreSQL, `@supabase/ssr` (sessão via cookies), RLS estrito
- **Zod** + **React Hook Form** (validação e formulários)
- **sonner** (toasts)
- **PWA** — manifest, service worker e Web Push (VAPID)
- **Sentry** (observabilidade, opcional) e **Vercel Analytics / Speed Insights**

Idioma base da aplicação: português do Brasil (pt-BR).

## Arquitetura

- **RSC-first**: `"use client"` restrito às folhas da árvore que exigem interatividade.
- **Orientada a features**: o domínio vive em `src/features/<dominio>` (ex.: `match`,
  `standings`, `league`, `cup`, `tournament`, `profile`, `discovery`, `notifications`).
- **Mutações via Server Actions** em `src/actions` — não há rotas de API HTTP tradicionais
  para escrita.
- **Validação com Zod** e formatos brasileiros (ex.: celular).
- **Segurança em profundidade**: RLS no banco **mais** checagem de propriedade nas Server
  Actions. `supabase/schema.sql` é a fonte de verdade do banco; DDL e migrations são
  aplicadas manualmente (não automaticamente pelo app).

## Como rodar em desenvolvimento

Pré-requisitos: Node 20+, [pnpm](https://pnpm.io) e (para o banco local) a
[Supabase CLI](https://supabase.com/docs/guides/local-development).

1. Instale as dependências:

   ```bash
   pnpm install
   ```

2. Configure o ambiente: copie `.env.example` para `.env.local` e preencha as chaves
   (veja a seção **Variáveis de ambiente**).

3. Suba o banco local (opcional, se for usar Supabase local):

   ```bash
   npx supabase start
   # String de conexão do stack local (porta 54322 do config.toml):
   LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

   # Aplique o schema (fonte de verdade) em DOIS passes: o schema.sql tem uma
   # forward-ref (um índice referencia a coluna `rodada`, criada mais adiante),
   # então o passe 1 é tolerante e o passe 2 é estrito.
   psql "$LOCAL_DB" -f supabase/schema.sql >/dev/null 2>&1 || true   # passe 1 (tolerante)
   psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f supabase/schema.sql        # passe 2 (estrito)

   # CRÍTICO: grants de paridade com a produção. Sem eles o PostgREST nega
   # anon/authenticated ("permission denied for table ...") mesmo com a anon key
   # correta — o Supabase Cloud concede esses grants automaticamente; o stack
   # local, não.
   psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f supabase/local-grants.sql
   ```

4. Rode a aplicação — direto no host:

   ```bash
   pnpm dev
   ```

   ...ou via Docker (hot reload em http://localhost:3000):

   ```bash
   docker compose up
   ```

A aplicação fica em http://localhost:3000.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha. Nunca versione `.env.local`. As
variáveis de runtime são validadas em build/boot por `src/lib/env.ts` (fail-fast): se
faltar `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`, o build/dev falha
nomeando a variável.

**Públicas** (prefixo `NEXT_PUBLIC_`, expostas ao browser):

- `NEXT_PUBLIC_SITE_URL` — URL canônica do site (base de metadados/OG).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — projeto Supabase.
- `NEXT_PUBLIC_SENTRY_DSN` — DSN do Sentry (opcional; sem ele, tudo é no-op).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — chave pública de Web Push (opcional).

**Server-side** (nunca com prefixo `NEXT_PUBLIC_`):

- `SUPABASE_SERVICE_ROLE_KEY` — bypassa RLS; uso administrativo server-side.
- `DATABASE_URL` — conexão Postgres para migrations/admin via CLI.
- `API_FOOTBALL_KEY` — busca de clube/escudo (opcional; degrada graciosamente).
- `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push (opcionais).
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — upload de source maps no build
  (opcionais).

Consulte `.env.example` para a descrição completa de cada chave.

## Scripts

- `pnpm dev` — servidor de desenvolvimento.
- `pnpm build` — build de produção.
- `pnpm start` — sobe o build de produção.
- `pnpm typecheck` — checagem de tipos (`tsc --noEmit`).
- `pnpm lint` — ESLint.
- `pnpm test` — testes unitários/integração (Vitest).
- `pnpm test:rls` — testes de RLS do banco (pgTAP, via `supabase/tests/run.sh`).

## Licença

Este repositório não possui um arquivo de licença. Salvo indicação em contrário, o código
é **proprietário — Todos os direitos reservados**. Não há concessão de licença de uso,
cópia, modificação ou distribuição.
