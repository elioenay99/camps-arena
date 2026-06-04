## Why

O repositório já tem 72 testes (vitest), typecheck estrito e lint configurados, mas **nada os executa automaticamente**: hoje só rodam se alguém lembrar de rodar `pnpm test`/`tsc`/`lint` localmente. Uma regressão pode chegar ao `main` sem detecção. Antes de o roadmap adicionar features (criação de torneio/partida, hardening de segurança), precisamos da barreira automatizada que protege todo o trabalho subsequente. É o item de maior alavanca risco-por-esforço da varredura (rank 1, esforço S, sem mudança de banco).

## What Changes

- Adiciona um workflow de **GitHub Actions** (`.github/workflows/ci.yml`) que roda em **Pull Requests** para `main` e em **push** para `main`.
- O workflow executa, em sequência, os gates de qualidade já existentes no `package.json`:
  - **typecheck**: `pnpm exec tsc --noEmit`
  - **lint**: `pnpm lint` (eslint)
  - **testes**: `pnpm test` (`vitest run`, 72 testes)
- Usa **pnpm** com `corepack` (versão pinada `pnpm@10.33.2`), instalação com **`--frozen-lockfile`** (falha se o lockfile divergir), **Node 22 LTS** (igual ao dev local) e **cache do store do pnpm** para acelerar.
- Falha o check de PR se qualquer gate falhar, impedindo merge de regressão.
- Não altera código de aplicação nem banco de dados.

## Capabilities

### New Capabilities
- `continuous-integration`: gate de qualidade automatizado em CI (typecheck, lint e testes) executado em pull requests e em push para a branch principal, bloqueando merge quando qualquer verificação falha.

### Modified Capabilities
<!-- Nenhuma: não muda requisitos de capabilities existentes. -->

## Impact

- **Novos arquivos**: `.github/workflows/ci.yml` (e, se necessário, ajustes mínimos de scripts no `package.json` — ex.: um alias `typecheck`).
- **Dependências**: nenhuma nova dependência de runtime; usa apenas o toolchain já presente (pnpm, tsc, eslint, vitest) e ações oficiais do GitHub (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`).
- **Banco de dados**: nenhum (needs_db = false). O job de CI não acessa Supabase nem precisa de segredos do banco; os testes usam mocks.
- **Segredos**: o pipeline não requer `service_role`, `DATABASE_URL` nem `API_FOOTBALL_KEY` — a suíte é hermética (mocks de Supabase, `next/cache`, `server-only` e da API-Football).
- **Processo**: estabelece o gate que protege as próximas mudanças do Tier 0 (hardening de segurança, validação de env) e seguintes.
