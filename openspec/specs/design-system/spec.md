# design-system Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Fundação Next.js com TypeScript strict
A aplicação SHALL ser um projeto Next.js 16 com App Router, diretório `src/` e TypeScript em modo `strict`.

#### Scenario: Build de produção íntegro
- **WHEN** `pnpm build` é executado
- **THEN** o build compila sem erros de tipo e gera as rotas estáticas

### Requirement: Design system com temas claro e escuro
A aplicação SHALL usar shadcn/ui (base Radix) com CSS variables e SHALL oferecer alternância entre tema claro e escuro, com escuro como padrão.

#### Scenario: Tema escuro por padrão
- **WHEN** um visitante acessa a aplicação pela primeira vez
- **THEN** o tema escuro é aplicado por padrão

#### Scenario: Alternância de tema
- **WHEN** o usuário aciona o controle de tema
- **THEN** a interface alterna entre claro e escuro sem recarregar a página

### Requirement: Ambiente de desenvolvimento em Docker
O projeto SHALL fornecer um ambiente Docker local que sobe o servidor de desenvolvimento com hot reload.

#### Scenario: Subir app em dev via Docker
- **WHEN** `docker compose up` é executado
- **THEN** a aplicação fica disponível em `http://localhost:3000` com hot reload ativo

