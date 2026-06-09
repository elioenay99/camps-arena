# Tasks — bump-ci-actions-node24

## 1. Bump das actions

- [x] 1.1 `.github/workflows/ci.yml`: `actions/checkout@v4` → `@v6`,
      `actions/setup-node@v4` → `@v6`, `pnpm/action-setup@v4` → `@v6`. Manter
      `node-version: 22`, `cache: pnpm` e `--frozen-lockfile`.

## 2. Validação

- [x] 2.1 Gates locais: typecheck/lint/test continuam verdes (sanidade — o bump
      não toca código, mas confirma o ambiente). 840 testes ✅.
- [ ] 2.2 Commit + push + CI verde (a execução real prova as actions node24 e a
      ausência do aviso de deprecação) + archive. Sem pendência manual.
