## Why

Último item do Tier 1 e pré-requisito direto dos standings do Tier 2. Hoje não existe NENHUMA noção de pontuação: partidas têm placar, mas nada converte resultados em pontos nem ordena participantes. Decisões de produto tomadas pelo usuário (2026-06-04): **pontuação configurável por torneio** (vitória/empate/derrota, defaults 3/1/0, expostos no form de criação) e **desempate estilo CBF simplificado** (pontos → vitórias → saldo de gols → gols pró → confronto direto → empate persistente dividindo a posição).

## What Changes

- **DDL (manual)** em `tournaments`: `pontos_vitoria` (default 3), `pontos_empate` (default 1), `pontos_derrota` (default 0) — `integer not null` + CHECK de sanidade `0 <= derrota <= empate <= vitoria <= 100` (configuração incoerente, ex. derrota valendo mais que vitória, é rejeitada no banco; espelhada no Zod).
- **Schema Zod**: `createTournamentSchema` ganha `pontosVitoria`/`pontosEmpate`/`pontosDerrota` (inteiros 0–100, defaults 3/1/0, refine `derrota <= empate <= vitoria`). Conversão explícita de string do form na action (sem `z.coerce`, mesma decisão do placar).
- **Action `createTournament`**: insere as 3 colunas.
- **UI `TournamentForm`**: 3 inputs numéricos pré-preenchidos (3/1/0).
- **Motor de classificação** (entregável central): módulo PURO `src/features/standings/computeStandings.ts` — recebe regras do torneio + partidas e devolve a tabela ordenada. Só partidas `encerrada` pontuam; partidas sem ambos os participantes são ignoradas. Desempate em cadeia: pontos → vitórias → saldo → gols pró → **confronto direto (só entre exatamente 2 empatados**, como na CBF; com 3+ o critério é pulado) → empate persistente (mesma `posicao`, estilo "1º, 1º, 3º"). Sem UI aqui — o Tier 2 só renderiza.
- **Tipos**: `database.types.ts` ganha as 3 colunas.
- **Testes**: bateria pesada no motor (função pura) + schema + action + form.

## Capabilities

### New Capabilities
- `standings-engine`: cálculo de classificação com regras por torneio e cadeia de desempate.

### Modified Capabilities
- `data-model`: `tournaments` ganha as 3 colunas de pontuação.
- `tournament-management`: criação de torneio aceita pontuação customizada.

## Impact

- **Código**: `src/features/standings/computeStandings.ts` (novo, puro), `src/schema/tournamentSchema.ts`, `src/actions/tournaments.ts`, `src/features/tournament/components/TournamentForm.tsx`, `src/lib/supabase/database.types.ts`.
- **Banco (DDL manual)**: 3 colunas + 1 CHECK em `tournaments`. **needs_db = true** — torneios existentes herdam 3/1/0 via default (comportamento esperado). Instruções em `docs/pendencias-manuais.md` (seção 6).
- **Não-impacto**: nenhuma RLS muda (colunas cobertas pelas policies existentes de `tournaments`); partidas/dashboard intactos.
- **Fora de escopo**: página de standings (Tier 2); editar pontuação de torneio existente (a RLS de UPDATE já permite ao dono; a tela vem com o lifecycle); critérios adicionais (cartões, sorteio); bracket/mata-mata (Tier 3 — este motor é de pontos corridos).
