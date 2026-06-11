# design-system — Delta Spec

## ADDED Requirements

### Requirement: Identidade nominal da marca

A aplicação SHALL usar o nome **Goliseu** como marca em toda superfície visível ao
usuário: o wordmark (`GOLISEU·` com o ponto no `--primary`), os títulos de página
e metadados de SEO/OG (`siteName`, `og:title`, `twitter:title`), e a cópia que
nomeia o produto. O símbolo da marca SHALL ser um escudo hexagonal contendo o
glifo "G", reutilizado no favicon (`app/icon.svg`) e no componente de marca
inline (que herda `currentColor`), mantendo a cor fixa roxa Dracula (`#bd93f9`) no
favicon e no card de OG estático. Nenhuma superfície visível SHALL exibir o nome
anterior ("Arena").

#### Scenario: Wordmark e símbolo coerentes

- **WHEN** o usuário vê o hero de autenticação, a landing ou o header do dashboard
- **THEN** o wordmark exibe `GOLISEU·` e o escudo contém o glifo "G"

#### Scenario: Metadados refletem a marca

- **WHEN** um link do app é compartilhado ou indexado
- **THEN** o `siteName`/título e o card de OG nomeiam "Goliseu", sem citar "Arena"
