# Proposal — add-competidores-por-nome

## Why

Depois da virada clube-cêntrica, os formatos GERADOS (liga, grupos+mata-mata, fase
de liga, mata-mata) disputam por VAGAS de CLUBE — cada vaga exige um clube real
(busca na API-Football + escudo) e um técnico. O formato AVULSO é "de pessoas" mas
não gera tabela/chave. Falta o caso comum (pedido do usuário 2026-06-11): gerar uma
liga/mata-mata só com **nomes de jogadores**, sem clube — "o nome do jogador é o
competidor". Ver [[projeto-competidores-por-nome]].

## What Changes

Decisões de PRODUTO (AskUserQuestion): (1) **toggle por torneio** — um torneio é TODO
de clubes reais OU TODO de nomes (nunca misto); (2) **rótulo fixo, sem dono** — o
competidor por nome é só um texto, sem técnico, sem convite de vaga, sem dono; o
organizador lança todos os placares; (3) **nomes únicos por torneio** (case-insensitive).

- **Modelo**: `tournament_slots.team_id` passa a ser ANULÁVEL e ganha `rotulo text`
  (mutuamente exclusivo via CHECK XOR); `tournaments.por_nome boolean`. Sem backfill
  (todo slot legado tem `team_id`).
- **Criação**: toggle "competidores por nome" no `TournamentForm` (formatos
  competitivos) → passo de digitar nomes em vez de buscar clubes; `createTournament`
  bifurca o INSERT de vaga e PULA os convites no modo nome.
- **Exibição**: o `TeamCrest` JÁ cai para iniciais quando não há escudo — os fetchers
  só resolvem `nome = team?.nome ?? rotulo` e `escudoUrl = team?.escudo_url ?? null`.
- **Sem mudança**: motores de geração (ids opacos), `matches`, RLS de placar (dono
  lança — já é o comportamento), e o W.O. automático (`varrerOrfaosDaRodada` só marca
  XOR-órfão; órfão×órfão — todas as vagas por nome — nunca é varrido). Ver design.

## Capabilities

Modifica `club-slots` (a vaga competitiva pode ser um CLUBE ou um NOME) e `data-model`
(schema das vagas por nome + flag do torneio).

## Impact

- **DDL** (aplicada por mim via MCP, autorizada 2026-06-12; espelhada em
  `supabase/schema.sql`): ver `design.md`.
- **Editados (código)**: `schema/tournamentSchema.ts`, `actions/tournaments.ts`,
  4 fetchers (`getVagasDoTorneio`, `getActiveMatches`, `getTournamentClassificacao`,
  `getSolicitacoesWO`), `TournamentForm.tsx`, `VagasSection.tsx`, `MatchCard.tsx`,
  `lib/supabase/database.types.ts` (regenerado).
- **Sem mudança**: motores `gerar*`, `actions/match.ts`, `actions/wo.ts`,
  `closeRound.ts`, RLS de slots, `aceitar_convite_vaga`, `convite/[codigo]`,
  `MatchScoreModal` (fallback "Sem clube" já cobre).
- **Risco**: ALTO no DDL (altera NOT NULL de tabela viva — mitigado: aditivo, sem
  conflito de dados verificado) e classe "consumidor órfão" (mitigada pelo mapeamento
  exaustivo). Validar nos 2 temas + 390px; testes por fetcher com fixture rótulo.
