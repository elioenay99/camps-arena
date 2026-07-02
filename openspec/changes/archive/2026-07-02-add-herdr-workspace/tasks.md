## 1. Workspace (herd.sh)

- [x] 1.1 Detectar topologia: single-package (um `package.json`; `pnpm-workspace.yaml` é só allowlist de build scripts) — unidade única `goliseu` na raiz
- [x] 1.2 Gerar `herd.sh` com tab `goliseu` (agente + `pnpm dev` + `pnpm test` preparado sem Enter), tab `infra` (compose logs + psql 54322 via send-text sem credenciais) e tab `shell`; sem tab orquestrador
- [x] 1.3 Aplicar fixes da revisão: spawn com `if` explícito (propaga falha do `herdr pane run` sob `set -e`) e guard de idempotência por label antes do `workspace create` (fail-open se o list não parsear)
- [x] 1.4 `chmod +x herd.sh`

## 2. Protocolo do orquestrador

- [x] 2.1 Gerar `ORCHESTRATOR.md` com regras invioláveis e a unidade `goliseu` com marcadores determinísticos (`TESTS_OK`/`BUILD_OK`/`TYPES_OK`/`LINT_OK`) + seção infra (compose/Supabase local e teardown)

## 3. Validação

- [x] 3.1 `bash -n herd.sh` (sintaxe ok)
- [x] 3.2 Revisão adversarial por workflow (3 lentes + verificação cética, 7 agentes): 3 achados confirmados — heredoc corrigido; fixes de spawn e idempotência aplicados com autorização do dono
- [x] 3.3 `openspec validate add-herdr-workspace --strict`
