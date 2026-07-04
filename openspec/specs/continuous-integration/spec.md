# continuous-integration Specification

## Purpose
TBD - created by archiving change add-ci-pipeline. Update Purpose after archive.
## Requirements
### Requirement: Gate de qualidade em pull requests e na branch principal

O sistema SHALL executar, via integração contínua, os gates de qualidade do projeto
— typecheck, lint, testes e BUILD de produção — automaticamente em cada pull request
direcionado a `main` e em cada push para `main`. O build (`pnpm build`) SHALL rodar
após os gates baratos passarem (dependência de job) e SHALL usar apenas PLACEHOLDERS
públicos e sintéticos para as variáveis `NEXT_PUBLIC_*` que `src/lib/env.ts` exige
(nunca segredos reais), já que `next.config.ts` valida a env no início do build. O
resultado de cada gate SHALL ser reportado como status check do commit, e o pipeline
SHALL falhar (status de erro) quando qualquer gate falhar.

#### Scenario: Pull request que passa em todos os gates

- **WHEN** um pull request para `main` tem código que passa em typecheck, lint, testes e build
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

#### Scenario: Pull request que quebra o build de produção

- **WHEN** um pull request introduz um erro que só o `next build` acusa (prerender, avaliação de `next.config.ts`, resolução de módulos server/client) e passa nos demais gates
- **THEN** o job de build falha com placeholders públicos de env (sem segredos) e reporta status vermelho, antes de o código chegar ao deploy

#### Scenario: Push direto na branch principal

- **WHEN** um commit é enviado (push) para `main`
- **THEN** o pipeline executa os mesmos gates (incluindo build) e reporta o status do commit

### Requirement: Ambiente de CI reproduzível e hermético

O pipeline SHALL usar o gerenciador de pacotes pinado (`pnpm@10.33.2`) com instalação
`--frozen-lockfile` e Node 22 LTS, garantindo builds reproduzíveis. As GitHub Actions
usadas no workflow SHALL ser fixadas pelo COMMIT SHA de 40 caracteres (nunca por tag
móvel como `@v6`), com um comentário anotando a versão legível, para congelar o código
exato executado e mitigar supply-chain via re-apontamento de tag. O repositório SHALL
manter um `.github/dependabot.yml` que atualiza automaticamente, por pull request, os
ecossistemas `github-actions` (os SHAs pinados) e `npm` (as dependências) — cada PR
validado pelos próprios gates do CI. O pipeline SHALL executar a suíte e o build sem
depender de segredos de produção (sem `service_role`, `DATABASE_URL` ou
`API_FOOTBALL_KEY`), pois os testes são herméticos (mocks) e o build usa placeholders
públicos.

#### Scenario: Instalação reproduzível

- **WHEN** o pipeline instala dependências
- **THEN** usa `pnpm` na versão pinada e `--frozen-lockfile`, falhando se `pnpm-lock.yaml` divergir do `package.json`

#### Scenario: Actions fixadas por SHA

- **WHEN** o workflow referencia uma GitHub Action (`actions/checkout`, `actions/setup-node`, `pnpm/action-setup`)
- **THEN** a referência é um commit SHA de 40 caracteres com comentário de versão (ex.: `actions/checkout@df4cb1c… # v6.0.3`), nunca uma tag móvel

#### Scenario: Atualização automatizada dos pins

- **WHEN** sai uma release nova de uma Action pinada ou de uma dependência npm
- **THEN** o Dependabot abre um pull request bumpando o SHA/versão, que passa pelos gates do CI antes do merge

#### Scenario: Suíte e build herméticos sem segredos

- **WHEN** o pipeline roda testes e build sem nenhum segredo de produção configurado
- **THEN** a suíte completa passa (Supabase/`next/cache`/`server-only`/API-Football mockados) e o build compila com placeholders `NEXT_PUBLIC_*` sintéticos

### Requirement: Varredura de vulnerabilidades das dependências

O pipeline SHALL executar uma varredura de vulnerabilidades das dependências
(`pnpm audit --audit-level=high`) em cada pull request e push para `main`. Por ora a
varredura SHALL ser NÃO-BLOQUEANTE (`continue-on-error`), reportando vulnerabilidades
high/critical sem reprovar o merge, para dar visibilidade sem travar o fluxo enquanto
o baseline não é zerado.

#### Scenario: Dependência com vulnerabilidade high

- **WHEN** uma dependência do `pnpm-lock.yaml` tem vulnerabilidade conhecida de nível high ou critical
- **THEN** o job de audit a reporta na saída, mas (por ser não-bloqueante) não reprova o pipeline

#### Scenario: Sem vulnerabilidades

- **WHEN** nenhuma dependência tem vulnerabilidade de nível high ou acima
- **THEN** o job de audit conclui limpo

### Requirement: Validação de aplicação do schema em Postgres efêmero

O pipeline SHALL validar que `supabase/schema.sql` (a fonte de verdade do banco)
APLICA de forma limpa e IDEMPOTENTE num PostgreSQL efêmero cuja major casa a do
projeto (`postgres:17`, conforme `supabase/config.toml`), sem depender de segredo
algum (o Postgres é local ao runner; nada aponta para produção). Como `schema.sql`
assume objetos que a plataforma Supabase provê, o pipeline SHALL primeiro aplicar um
bootstrap de pré-requisitos (`supabase/ci-bootstrap.sql`: papéis anon/authenticated/
service_role, schemas `auth`/`storage` e a publication `supabase_realtime`), depois
aplicar `schema.sql` em dois passes — o primeiro TOLERANTE (forward-refs), o segundo
ESTRITO (`ON_ERROR_STOP`), que reprova o job se o schema não for idempotente — e por
fim `supabase/local-grants.sql` de forma estrita. Este job valida APLICABILIDADE e
IDEMPOTÊNCIA, não paridade com o schema de produção (drift real é follow-up que exige
segredo).

#### Scenario: Schema aplica limpo e idempotente

- **WHEN** o pipeline aplica o bootstrap, `schema.sql` (passe 1 tolerante + passe 2 estrito) e `local-grants.sql` no Postgres efêmero
- **THEN** os passes estritos concluem com sucesso (exit 0), confirmando schema aplicável e idempotente

#### Scenario: Schema não-idempotente reprova o job

- **WHEN** um pull request introduz em `schema.sql` um `create` sem o `drop ... if exists` correspondente (ou outra construção que falha num segundo apply)
- **THEN** o passe 2 estrito falha (`already exists`) e o job de schema reporta status vermelho

#### Scenario: Sem segredo do dono

- **WHEN** o job de schema roda
- **THEN** ele não usa `DATABASE_URL`, `service_role` nem qualquer segredo — o Postgres é um service container local ao runner

