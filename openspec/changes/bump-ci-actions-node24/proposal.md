# Proposal — bump-ci-actions-node24

## Why

As três GitHub Actions do workflow de CI (`actions/checkout@v4`,
`actions/setup-node@v4`, `pnpm/action-setup@v4`) rodam no runtime **Node 20**,
que o GitHub deprecará em junho/2026. O CI já emite o aviso recorrente
"Node.js 20 actions are deprecated" em cada execução. É manutenção pura, de
baixo risco e sem impacto no produto — só atualiza a pinagem das actions para as
majors atuais, que rodam em **Node 24** (`node24` no `runs.using`).

## What Changes

- **`actions/checkout@v4` → `@v6`** (v6.x usa `runs.using: node24`).
- **`actions/setup-node@v4` → `@v6`** (v6.x usa `runs.using: node24`).
- **`pnpm/action-setup@v4` → `@v6`** (v6.x usa `runs.using: node24`).
- **Mantém** `node-version: 22` no `setup-node`: o aviso é sobre o runtime *das
  actions*, não sobre a versão de Node que o projeto usa. Node 22 LTS continua
  sendo a versão dos gates e casa com o ambiente local (paridade). O `pnpm`
  pinado (`pnpm@10.33.2`, lido de `packageManager`) e o `--frozen-lockfile` não
  mudam.
- Pinagem por major flutuante (`@v6`), consistente com o estilo atual do arquivo.

## Capabilities

Nenhuma capability nova. Modifica o requisito de ambiente reproduzível da spec
`continuous-integration` para fixar que as actions usem runtime suportado.

## Impact

- **`.github/workflows/ci.yml`**: três linhas `uses:` atualizadas; nada mais.
- **Comportamento observável**: idêntico — mesmos gates (typecheck/lint/test),
  mesma hermeticidade, mesmo Node 22. Apenas some o aviso de deprecação.
- **Não muda**: código de produto, testes, DDL, segredos. Sem credencial.
- **Risco**: baixo. Breaking changes de v4→v6 dessas actions não afetam o uso
  atual (checkout simples; setup-node lendo `node-version` + `cache: pnpm`;
  action-setup lendo a versão pinada do `packageManager`). Validação = CI verde
  no push.
