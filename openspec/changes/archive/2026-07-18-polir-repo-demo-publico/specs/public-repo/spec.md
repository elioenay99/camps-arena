## ADDED Requirements

### Requirement: Documentação do repositório público reflete o projeto real

O repositório público SHALL conter um `README.md` em português do Brasil que descreva o
projeto real (não o boilerplate de scaffolding): o que é o Goliseu, a stack efetivamente
usada, a arquitetura, como rodar em desenvolvimento, as variáveis de ambiente, os scripts
disponíveis e a situação de licenciamento. O README NÃO SHALL conter emojis nem menção a
assistentes de IA. A stack e os scripts documentados SHALL corresponder ao `package.json`.

#### Scenario: README descreve o projeto e não o scaffolding
- **WHEN** alguém abre o `README.md` do repositório público
- **THEN** encontra a descrição do Goliseu, a stack real, a arquitetura, instruções de dev, variáveis de ambiente, scripts e licença — sem o texto padrão do `create-next-app`

#### Scenario: Licença documentada sem inventar termos open-source
- **WHEN** o repositório não possui um arquivo `LICENSE`
- **THEN** o README declara o código como proprietário ("Todos os direitos reservados") em vez de afirmar uma licença open-source inexistente

### Requirement: Variáveis de ambiente documentadas e classificadas

O arquivo `.env.example` SHALL enumerar todas as variáveis de ambiente de runtime lidas pelo
app, separando explicitamente as públicas (`NEXT_PUBLIC_*`, expostas ao browser) das
server-side (nunca com prefixo público), sem conter valores reais/segredos.

#### Scenario: .env.example cobre as variáveis usadas no código
- **WHEN** o código referencia uma variável de ambiente de runtime via `process.env`
- **THEN** essa variável consta no `.env.example`, classificada como pública ou server-side, sem valor real

### Requirement: Ausência de dependências de desenvolvimento órfãs

O `package.json` NÃO SHALL declarar dependências de desenvolvimento que não sejam usadas por
nenhuma configuração, suíte ou script do projeto.

#### Scenario: Ferramenta de teste sem uso não permanece declarada
- **WHEN** uma devDependency (ex.: um runner E2E) não tem config, suíte nem script que a utilize
- **THEN** ela não consta em `devDependencies` do `package.json`
