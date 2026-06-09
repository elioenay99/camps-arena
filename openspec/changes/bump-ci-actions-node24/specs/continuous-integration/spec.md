# continuous-integration — Delta Spec

## MODIFIED Requirements

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
