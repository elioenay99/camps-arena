## Why

Clicar em **"Equipe"** na página de uma pirâmide de ligas (`/dashboard/ligas/[id]`) levava a
**"Página não encontrada" (404)** — até para o DONO da liga. A rota `/dashboard/ligas/[id]/equipe`
existe e compila; o 404 vinha da lógica da página.

**Causa raiz:** o `[id]` da rota de ligas é o **id da TEMPORADA** (`league_seasons.id`) — é o que
a página da temporada e a de Identidade (cores) recebem. A página de **cores** resolve corretamente
`temporada → competição` via `getSeason` e usa `temporada.competicao.id`. Já a página de **equipe**
tratava `[id]` como se fosse o id da **competição**: chamava `podeGerir({ competitionId: id })` (com
o id da temporada → sempre falso) e consultava `league_competitions` por esse id (→ null). Resultado:
`notFound()` para todo mundo, inclusive o dono.

## What Changes

- A página `src/app/dashboard/ligas/[id]/equipe/page.tsx` passa a resolver a temporada via
  `getSeason(id, user.id)` (que JÁ gateia por capacidade GERIR e devolve `null` sem acesso →
  404 sem oráculo) e usa **`temporada.competicao.id`** como `competitionId` para listar/gerir
  membros, convites e adicionar membros. Espelha exatamente o que a página de Identidade faz.
- O dono e o nome passam a vir de `temporada.competicao` (`criadaPor`/`nome`) — sem query extra.

## Capabilities

### Modified Capabilities

- **competition-roles**: registra que a equipe da liga é acessada pela rota da TEMPORADA e
  resolve para a competição (corrige o 404).

## Impact

- **Sem DDL.** Correção contida em `src/app/dashboard/ligas/[id]/equipe/page.tsx`.
- **Torneios não afetados**: lá o `[id]` da rota é o próprio id do torneio (sem indireção de
  temporada); a equipe do torneio sempre funcionou.
- Restaura o acesso à equipe da liga (adicionar admins/árbitros/moderadores, convites).
