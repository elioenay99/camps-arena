## Why

Primeiro item do Tier 2 (visualização de progresso). O motor `computeStandings` (Tier 1d) está pronto e testado, mas nenhuma tela o consome — o usuário lança placares e não vê classificação nenhuma. Esta change liga fetch → motor → render: a página do torneio com a tabela de classificação.

## What Changes

- **Fetcher** `getTournamentClassificacao(tournamentId)` (`src/features/standings/data/`): busca o torneio (título, status, regras `pontos_*`) e suas partidas com os nomes dos participantes embutidos (FK-hints explícitos, padrão de `getActiveMatches`); roda `computeStandings` e devolve `{ torneio, linhas }` com `nome` resolvido por participante. Torneio inexistente/invisível (RLS) → `null` (página → `notFound()`).
- **Página** `/dashboard/torneios/[id]` (RSC protegida): cabeçalho com título/status/regras do torneio + tabela de classificação + estado vazio ("nenhuma partida encerrada ainda"). `params.id` validado como uuid ANTES da query (uuid inválido → `notFound()`, não erro 500 do PostgREST). Next 16: `params` é Promise (`await params`).
- **Tabela** `StandingsTable` (`src/features/standings/components/`): componente RSC puro (zero `"use client"` — só renderiza), colunas Pos/Participante/P/J/V/E/D/GP/GC/SG, `<table>` nativa estilizada com tokens do design system.
- **Entrada**: no `MatchCard`, o nome do torneio no subtítulo vira `Link` para a página — requer `id` no embed `tournament` de `getActiveMatches` (campo novo no tipo `PartidaAtiva`).
- **Testes**: fetcher (mapeamento de nomes, torneio invisível → null, erro → throw), atualização dos testes de `getActiveMatches` (id no embed).

## Capabilities

### New Capabilities
- `standings-page`: página do torneio com tabela de classificação.

### Modified Capabilities
- `dashboard`: o card de partida passa a linkar para a página do torneio.

## Impact

- **Código**: `src/features/standings/data/getTournamentClassificacao.ts` (novo, +teste), `src/features/standings/components/StandingsTable.tsx` (novo), `src/app/dashboard/torneios/[id]/page.tsx` (novo), `src/features/match/data/getActiveMatches.ts` (+`tournament.id`, +teste), `src/features/match/components/MatchCard.tsx` (link).
- **Banco**: NENHUMA mudança (zero DDL — usa o que o Tier 1 entregou). Sem pendência manual nova.
- **Segurança**: nada novo a proteger — leitura coberta pelas RLS existentes (`tournaments_select_visivel`, `matches_select_visivel`); a página herda a proteção do middleware (`/dashboard`).
- **Fora de escopo**: listagem "meus torneios"; histórico de partidas encerradas (próximo item do Tier 2); stats por clube; edição do torneio.
