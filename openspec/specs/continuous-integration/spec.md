# continuous-integration Specification

## Purpose
TBD - created by archiving change add-ci-pipeline. Update Purpose after archive.
## Requirements
### Requirement: Gate de qualidade em pull requests e na branch principal

O sistema SHALL executar, via integração contínua, os gates de qualidade do projeto
— typecheck, lint e testes — automaticamente em cada pull request direcionado a `main`
e em cada push para `main`. O resultado SHALL ser reportado como status check do commit,
e o pipeline SHALL falhar (status de erro) quando qualquer gate falhar.

#### Scenario: Pull request que passa em todos os gates

- **WHEN** um pull request para `main` tem código que passa em typecheck, lint e testes
- **THEN** o pipeline conclui com sucesso e reporta status verde no commit do PR

#### Scenario: Pull request com erro de typecheck

- **WHEN** um pull request introduz um erro de tipo (`tsc --noEmit` falha)
- **THEN** o pipeline falha no passo de typecheck e reporta status vermelho, sinalizando o PR como não-mesclável quando o status check é obrigatório

#### Scenario: Pull request com teste falhando

- **WHEN** um pull request faz um dos testes (`vitest run`) falhar
- **THEN** o pipeline falha no passo de testes e reporta status vermelho

#### Scenario: Pull request com violação de lint

- **WHEN** um pull request introduz uma violação de lint (`eslint` falha)
- **THEN** o pipeline falha no passo de lint e reporta status vermelho

#### Scenario: Push direto na branch principal

- **WHEN** um commit é enviado (push) para `main`
- **THEN** o pipeline executa os mesmos gates e reporta o status do commit

### Requirement: Ambiente de CI reproduzível e hermético

O pipeline SHALL usar o gerenciador de pacotes pinado (`pnpm@10.33.2`) com instalação
`--frozen-lockfile` e Node 22 LTS, garantindo builds reproduzíveis. As GitHub Actions
usadas no workflow SHALL ser fixadas em versões cujo runtime seja suportado pelo runner
(Node 24), evitando avisos de deprecação. O pipeline SHALL executar a suíte sem depender
de segredos de produção (sem `service_role`, `DATABASE_URL` ou `API_FOOTBALL_KEY`), pois
os testes são herméticos (usam mocks).

#### Scenario: Instalação reproduzível

- **WHEN** o pipeline instala dependências
- **THEN** usa `pnpm` na versão pinada e `--frozen-lockfile`, falhando se `pnpm-lock.yaml` divergir do `package.json`

#### Scenario: Actions com runtime suportado

- **WHEN** o workflow é executado
- **THEN** todas as actions (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`) rodam em runtime Node 24, sem emitir aviso de deprecação de runtime

#### Scenario: Suíte hermética sem segredos

- **WHEN** o pipeline roda os testes sem nenhum segredo configurado no ambiente de CI
- **THEN** a suíte completa passa, pois Supabase, `next/cache`, `server-only` e a API-Football são mockados

