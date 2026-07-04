## ADDED Requirements

### Requirement: Links do dashboard para rotas RSC caras não disparam prefetch em massa

Os links do dashboard que apontam para rotas RSC caras (páginas `[id]` de torneio, liga, copa ou competidor) e aparecem em QUANTIDADE — seja porque a navegação do header está presente em toda página, seja porque um índice/lista renderiza N `<Link>` no viewport — NÃO SHALL disparar prefetch automático ao abrir a página. O `<Link>` do App Router (Next 16) prefetcha ao entrar no viewport por padrão (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`); com dezenas de links simultâneos, a rajada de requisições RSC concorrentes é DESCARTADA pela borda da Vercel antes de invocar a função (HTTP 503), mesmo com o backend saudável. Esses links SHALL usar `prefetch={false}` (App Router: "never happen both on entering the viewport and on hover" — `link.md:304`), eliminando a rajada; a navegação por CLIQUE SHALL permanecer intacta (o Next busca a rota-alvo na hora do clique). Nos componentes `<Button asChild><Link>`, a prop SHALL ir no `<Link>` interno.

O ajuste SHALL cobrir: a navegação do header (`NavLinks`, as rotas de seção presentes em toda página — maior alavanca), os links "Abrir …" para rota de torneio (na página da liga e nos painéis de playoff e de grande final), os cards dos índices/vitrine (torneios, ligas, copas, "Explorar"), a lista de edições na página da copa (cada edição aponta para `copas/edicao/[id]`, que renderiza bracket + classificação — RSC cara), e o link do título do torneio no card de partida. Os links que aparecem UM por página e apontam para rotas leves (botões "Nova/Criar/Novo" de formulário, a marca e o avatar do shell, links já dentro de páginas de detalhe `[id]`) SHALL permanecer com o prefetch padrão — não formam rajada e o prefetch é boa UX.

#### Scenario: Abrir uma página do dashboard não prefetcha as rotas de seção do header

- **WHEN** um usuário logado abre qualquer página do dashboard (o header com a
  navegação principal aparece em todas)
- **THEN** nenhuma das ~6 rotas de seção do header é prefetchada ao entrar no viewport
  (cada `<Link>` da nav usa `prefetch={false}`), evitando a rajada em toda navegação

#### Scenario: Abrir um índice de lista não dispara N prefetches das rotas [id]

- **WHEN** o usuário abre um índice/vitrine (torneios, ligas, copas ou "Explorar") com
  vários itens no viewport
- **THEN** nenhum dos cards prefetcha sua rota-alvo `[id]` (RSC cara) ao entrar no
  viewport, evitando a rajada de prefetches que a borda da Vercel descartava (503)

#### Scenario: Abrir a página de uma copa não prefetcha as edições em massa

- **WHEN** o usuário abre a página de uma copa com várias edições listadas no viewport
- **THEN** nenhuma edição prefetcha sua rota `copas/edicao/[id]` (bracket +
  classificação, RSC cara) ao entrar no viewport, evitando a rajada de prefetches que a
  borda da Vercel descartava (503)

#### Scenario: Clicar num link ainda navega normalmente

- **WHEN** o usuário clica num link de seção do header ou num card de lista/"Abrir …"
- **THEN** a navegação leva à rota-alvo normalmente (o clique busca a rota na hora),
  mesmo sem prefetch prévio

#### Scenario: Links leves de uma-ocorrência mantêm o prefetch padrão

- **WHEN** a página renderiza um link que aparece uma vez e aponta para rota leve
  (botão "Novo/Criar", a marca ou o avatar do shell)
- **THEN** esse link mantém o prefetch padrão do App Router (não forma rajada; o
  prefetch melhora a navegação)
