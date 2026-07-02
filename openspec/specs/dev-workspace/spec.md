# dev-workspace Specification

## Purpose
TBD - created by archiving change add-herdr-workspace. Update Purpose after archive.
## Requirements
### Requirement: Bootstrap reproduzível do workspace herdr

O repositório SHALL fornecer um script versionado (`herd.sh`) que monta o workspace
herdr do projeto: tab da unidade `goliseu` com pane de agente, server de
desenvolvimento (`pnpm dev`) e pane de testes preparado sem execução automática; e
tab `infra` com logs do docker compose e conexão `psql` ao Supabase local preparada
via send-text, sem credenciais embutidas. O script SHALL ser idempotente por label
de workspace: não SHALL duplicar panes/servers de um workspace já existente.

#### Scenario: Primeira execução com herdr ativo

- **WHEN** `./herd.sh` roda dentro do herdr e não existe workspace com o label do projeto
- **THEN** cria o workspace com as tabs `shell`, `goliseu` (agente + server + testes preparados) e `infra`, e imprime o mapa de panes com os comandos de orquestração

#### Scenario: Reexecução com workspace já existente

- **WHEN** `./herd.sh` roda e já existe um workspace com o mesmo label
- **THEN** o script falha com mensagem clara (fechar o workspace ou passar outro nome) e não cria um segundo `pnpm dev` disputando a porta 3000

#### Scenario: herdr não está rodando

- **WHEN** `./herd.sh` roda fora de um pane herdr e sem servidor herdr ativo
- **THEN** o script falha imediatamente instruindo a abrir o herdr

#### Scenario: Pane de banco sem credenciais

- **WHEN** o workspace é montado e o usuário foca o pane de banco da tab `infra`
- **THEN** encontra o comando `psql` preparado (sem Enter) apontando à porta do Supabase local, sem senha embutida — a autenticação é interativa

### Requirement: Protocolo do orquestrador versionado

O repositório SHALL manter `ORCHESTRATOR.md` com o protocolo do orquestrador —
validação verde antes de merge, proibição de DDL/seeds/operações destrutivas sem GO
humano, `git add` cirúrgico — e a lista de unidades com comandos de teste/build e
marcadores de sucesso determinísticos utilizáveis via `herdr wait output`.

#### Scenario: Orquestrador valida a unidade antes de merge

- **WHEN** o orquestrador precisa confirmar a unidade `goliseu` verde
- **THEN** encontra no `ORCHESTRATOR.md` comandos com marcadores determinísticos (ex.: `pnpm test && echo TESTS_OK` aguardando "TESTS_OK") em vez de depender do output nativo das ferramentas

