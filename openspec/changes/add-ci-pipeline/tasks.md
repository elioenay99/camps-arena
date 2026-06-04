## 1. Script de typecheck

- [x] 1.1 Adicionar script `"typecheck": "tsc --noEmit"` ao `package.json` (sem remover/alterar os demais scripts)
- [x] 1.2 Verificar localmente que `pnpm typecheck`, `pnpm lint` e `pnpm test` passam (estado verde antes de codificar o CI)

## 2. Workflow de CI

- [x] 2.1 Criar `.github/workflows/ci.yml` com triggers `pull_request` (branch `main`) e `push` (branch `main`)
- [x] 2.2 Adicionar bloco `concurrency` com `group` por ref e `cancel-in-progress: true`
- [x] 2.3 Definir job `quality` em `ubuntu-latest`: `actions/checkout@v4` → `pnpm/action-setup@v4` (lê versão de `packageManager`) → `actions/setup-node@v4` com `node-version: 22` e `cache: 'pnpm'`
- [x] 2.4 Passo de instalação com `pnpm install --frozen-lockfile`
- [x] 2.5 Passos sequenciais: `pnpm typecheck` → `pnpm lint` → `pnpm test`
- [x] 2.6 Garantir que o job NÃO referencia nenhum segredo (`secrets.*`) — a suíte é hermética

## 3. Validação

- [x] 3.1 Validar a sintaxe do YAML (lint local, ex.: `yamllint` ou parser; sem chaves indefinidas)
- [x] 3.2 Conferir que o change OpenSpec valida: `openspec validate add-ci-pipeline --strict`
- [ ] 3.3 (Pós-merge, ação do usuário) Abrir um PR de teste e confirmar que o check `quality` roda verde; depois habilitar branch protection exigindo o check `quality` em `main`
