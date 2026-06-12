# Tasks — add-competidores-por-nome

## 1. DDL (via MCP; espelhar em supabase/schema.sql) — ✅ APLICADA EM PROD 2026-06-12

- [x] 1.1 Pré-check (read-only): 18 slots, 0 com `team_id is null` (XOR seguro).
- [x] 1.2 Aplicada (migração `competidores_por_nome`): `team_id` nullable + `rotulo`
      + CHECK XOR/não-vazio + índices parciais (team/rotulo) + `tournaments.por_nome`
      + trava de `rotulo` no `lock_slot_relations` + `info_convite_vaga` LEFT JOIN/
      coalesce. VERIFICADA (colunas/constraints/índices presentes).
- [x] 1.3 Espelhado em `supabase/schema.sql`; `database.types.ts` atualizado à mão
      (team_id nullable + rotulo + tournaments.por_nome). Typecheck verde.

## 2. Server (criação)

- [x] 2.1 `tournamentSchema.ts`: `porNome` + `nomes` + refines (min 2, dup
      case-insensitive, teto liga por path clubes/nomes).
- [x] 2.2 `actions/tournaments.ts`: persiste `por_nome`; bifurca INSERT de vaga
      (array tipado); pula convites no modo nome; normaliza server-side
      (`porNome = ehGerado && form`).

## 3. Exibição (fetchers + UI)

- [x] 3.1 Fetchers (`getVagasDoTorneio` +flag porNome, `getActiveMatches`
      clube nullable, `getTournamentClassificacao` rotulo+orfao só-clube,
      `getSolicitacoesWO`): embed `rotulo`, `nome = team?.nome ?? rotulo`.
- [x] 3.2 `TournamentForm`: toggle + `NomesStep` (chips, sem API).
- [x] 3.3 `VagasSection` + `MatchCard`: escondem técnico/convite no modo nome.

## 4. Validação

- [x] 4.1 Gates: typecheck / lint / test (853, +5 novos) / build.
- [x] 4.2 AO VIVO na PROD (Playwright, logado): criada liga POR NOME (João×Maria)
      → slot insert com rotulo passou na RLS → vagas com iniciais, sem técnico/
      convite → iniciada → tabela gerada (Rodada 1, Menu da Partida pro dono).
- [x] 4.3 Workflow adversarial (47 agentes, 4 lentes; approved_with_nits, 0 must_fix;
      os "críticos" de W.O. desmontados = design intencional). Fix do "(vaga aberta)"
      indevido (orfao só p/ vaga de clube). Nit de hardening (regenerarConviteVaga
      sem guard por-nome) registrado p/ futuro. Commit + push + CI + archive.
