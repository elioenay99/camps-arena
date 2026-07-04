## ADDED Requirements

### Requirement: Links de header, de gestão e back-links para rotas RSC caras não disparam prefetch

Os links de TOPO do shell autenticado — a marca e o avatar do header (presentes em TODA página do dashboard), os botões de gestão "Equipe" e "Identidade"/"Cores" (nas telas de liga e de torneio) e os back-links isolados que apontam para uma rota RSC cara ("Voltar à pirâmide"/"Ver liga" e o back da página do competidor) — NÃO SHALL disparar prefetch automático ao abrir a página. O `<Link>` do App Router (Next 16) prefetcha ao entrar no viewport por padrão (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`); mesmo poucos desses links, somados em páginas de alto tráfego, produzem uma rajada residual de requisições RSC concorrentes que a borda da Vercel DESCARTA antes de invocar a função (HTTP 503 ocasional), com o backend saudável. Esses links SHALL usar `prefetch={false}` (App Router: "never happen both on entering the viewport and on hover" — `link.md:304`), eliminando a rajada residual; a navegação por CLIQUE SHALL permanecer intacta (o Next busca a rota-alvo na hora do clique). Nos componentes `<Button asChild><Link>`, a prop SHALL ir no `<Link>` interno.

Os links que apontam para rotas LEVES de formulário (botões "Nova/Criar/Novo") SHALL permanecer com o prefetch padrão — são destino provável e não formam rajada. Este ajuste complementa as changes anteriores (`add-liga-prefetch-fix`, `add-dashboard-prefetch-hardening`), que já cobriram a nav do header, os índices/vitrine, os links "Abrir …" e a `StandingsTable`; nenhum desses SHALL ser re-alterado.

#### Scenario: Abrir qualquer página do dashboard não prefetcha a marca nem o avatar do header

- **WHEN** um usuário logado abre qualquer página do dashboard (o header com a marca
  "GOLISEU" e o avatar aparece em todas)
- **THEN** nem a marca (→ `/dashboard`) nem o avatar (→ `/dashboard/conta`) prefetcham
  sua rota ao entrar no viewport (ambos usam `prefetch={false}`), evitando somar à
  rajada em toda navegação

#### Scenario: Abrir a página de uma liga ou torneio não prefetcha os botões de gestão

- **WHEN** um gestor abre a página de uma liga ou de um torneio (com os botões "Equipe"
  e "Identidade"/"Cores" visíveis)
- **THEN** nenhum desses botões prefetcha sua rota de gestão (`.../equipe`, `.../cores`)
  ao entrar no viewport (cada `<Link>` interno usa `prefetch={false}`), evitando a
  rajada residual que a borda da Vercel descartava (503)

#### Scenario: Abrir uma página com back-link para a pirâmide não o prefetcha

- **WHEN** o usuário abre a página de um competidor ou de um torneio de liga, que
  exibe um back-link para a pirâmide-mãe ("Voltar à pirâmide" / "Ver liga", rota RSC
  cara)
- **THEN** o back-link não prefetcha `ligas/[id]` ao entrar no viewport
  (`prefetch={false}`), evitando somar à rajada residual

#### Scenario: Clicar num link de header, gestão ou back ainda navega normalmente

- **WHEN** o usuário clica na marca, no avatar, num botão de gestão ou num back-link
- **THEN** a navegação leva à rota-alvo normalmente (o clique busca a rota na hora),
  mesmo sem prefetch prévio

#### Scenario: Botões "Novo/Criar" leves mantêm o prefetch padrão

- **WHEN** a página renderiza um botão que aponta para uma rota de formulário leve
  (ex.: "Nova partida")
- **THEN** esse link mantém o prefetch padrão do App Router (destino provável, sem
  rajada; o prefetch melhora a navegação)
