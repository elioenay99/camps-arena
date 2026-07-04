## ADDED Requirements

### Requirement: Links de competidor da classificação sem prefetch em massa

Os links de competidor da `StandingsTable` (o ramo `hrefCompetidorBase`, que aponta cada nome para `dashboard/ligas/competidor/[id]`) NÃO SHALL disparar prefetch automático ao abrir a pirâmide: como uma temporada renderiza uma tabela por divisão com uma linha (link) por competidor — dezenas de links no viewport de uma vez — o prefetch-no-viewport padrão do `<Link>` do App Router (Next 16) dispararia um render RSC da página do competidor por link simultaneamente, cada um chamando o fetch pesado `getCompetitorProfile` (N+1), estourando o backend (HTTP 503). Esses links SHALL usar `prefetch={false}` (no App Router, "never happen both on entering the viewport and on hover" — `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:304`), eliminando a rajada. A navegação por CLIQUE SHALL permanecer intacta (o Next busca a rota-alvo na hora do clique). O ajuste SHALL valer SOMENTE para o link de competidor da tabela; os demais links da página (Equipe, Identidade, Abrir torneio, Voltar à pirâmide) SHALL permanecer inalterados. A `StandingsTable` usada em torneios avulsos (sem `hrefCompetidorBase`, nome em texto puro) SHALL permanecer byte-idêntica.

#### Scenario: Abrir a pirâmide não dispara a rajada de prefetch

- **WHEN** um usuário logado abre a página de uma pirâmide com divisões de ~20
  competidores (dezenas de links de competidor no viewport)
- **THEN** nenhum prefetch de `dashboard/ligas/competidor/*` é disparado ao entrar no
  viewport (o link usa `prefetch={false}`), evitando a rajada de renders de
  `getCompetitorProfile` que causava o 503

#### Scenario: Clicar num competidor ainda navega

- **WHEN** o usuário clica no nome de um competidor na classificação
- **THEN** a navegação leva à página `dashboard/ligas/competidor/[id]` normalmente (o
  clique busca a rota-alvo na hora), mesmo sem prefetch prévio

#### Scenario: Torneio avulso sem link permanece inalterado

- **WHEN** a `StandingsTable` renderiza num torneio avulso (sem `hrefCompetidorBase`)
- **THEN** o nome do participante aparece como texto puro (sem `<Link>`), idêntico ao
  comportamento atual
