## Why

O desenvolvimento do Goliseu passa a ser conduzido dentro do **herdr** (multiplexador
de terminal ciente de agentes), com Claude Code orquestrando panes de agente, server
e testes. Sem um bootstrap versionado, cada sessão exigiria montar manualmente o
workspace (tabs, splits, comandos), com risco de divergência entre máquinas e de
comandos de infra digitados errado (porta do Supabase local, compose). O repo precisa
de um script reproduzível e do protocolo do orquestrador registrados em código.

## What Changes

- Adiciona **`herd.sh`** na raiz: monta o workspace herdr do projeto (topologia
  detectada: **single-package**, sem tab orquestrador):
  - tab `goliseu`: pane de agente (topo) + server `pnpm dev` (porta 3000) + pane de
    testes com `pnpm test` preparado **sem Enter**;
  - tab `infra`: `docker compose logs -f` + conexão `psql` ao Supabase LOCAL
    (porta 54322, lida de `supabase/config.toml`) via `send-text` **sem Enter e sem
    credenciais**;
  - tab `shell` (a inicial do workspace, renomeada);
  - guard de **idempotência**: aborta se já existir workspace com o mesmo label
    (evita segundo `pnpm dev` disputando a porta 3000); spawn opcional de agentes
    via `SPAWN_AGENTS=1` com propagação correta de falha (`if` explícito).
- Adiciona **`ORCHESTRATOR.md`** na raiz: protocolo do orquestrador (validar verde
  antes de merge, nada de DDL/destrutivo sem GO humano, `git add` cirúrgico) e a
  lista de unidades com comandos e **marcadores determinísticos** para
  `herdr wait output` (`pnpm test && echo TESTS_OK`, `pnpm build && echo BUILD_OK`).
- Configuração **por máquina** fica fora do repo (não versionada): binário do herdr,
  hook `~/.claude/hooks/herdr-agent-state.sh`, `~/.config/herdr/config.toml`, skill.

## Capabilities

### New Capabilities
- `dev-workspace`: bootstrap reproduzível do workspace herdr do projeto e protocolo
  do orquestrador versionado, com marcadores de sucesso utilizáveis por automação.

### Modified Capabilities
<!-- Nenhuma: não muda requisitos de capabilities existentes. -->

## Impact

- **Novos arquivos**: `herd.sh` (executável), `ORCHESTRATOR.md`.
- **Código de aplicação**: nenhum. **Banco de dados**: nenhum. **Dependências**:
  nenhuma (usa herdr/python3/psql já presentes na máquina de dev).
- **Segredos**: nenhum nos arquivos; a conexão psql não embute senha (o psql pede).
- **Processo**: sessões de dev passam a abrir com `./herd.sh` dentro do herdr;
  agentes reportam estado via hook (por máquina).
