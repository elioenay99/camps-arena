## Why

Hoje o Goliseu registra apenas o PLACAR de cada partida — quem fez os gols se
perde. Sem isso não há como montar um ranking de **artilharia** por competição
nem uma seção de **artilheiros na carreira** do competidor persistente da
pirâmide (`league_competitors`), duas telas que dão profundidade competitiva
ao produto (na mesma linha da vitrine de pirâmide + hall da fama já entregue).

O caminho de lançamento de placar já existe em duas formas — direto
(`updateMatchScore`, organização/avulso) e por proposta com foto
(`proporPlacar` → aprovação atômica na RPC `aprovar_proposta_placar`) — mas
nenhuma captura os autores dos gols. Esta change adiciona a captura (opcional,
nome livre com autocomplete) e as telas de consumo, mantendo o placar como
única fonte de verdade da partida.

Assistências e MVP da partida ficam **fora de escopo** (evolução futura).

## What Changes

- **Schema (DDL aditivo, só documentado — não aplicado).** Nova tabela
  `public.match_goals` (partida × lado × nome livre × contagem de gols),
  genérica: resolve o competidor por JOIN (`matches.vaga_N →
  tournament_slots.competitor_id`), sem denormalizar `competitor_id` (o lado é
  imutável). Índice único funcional por `(match_id, lado, lower(btrim(jogador)))`
  (um autor por partida/lado, case-insensitive, com contagem). Nova coluna
  `match_score_proposals.autores jsonb null` guarda os autores propostos até a
  aprovação.
- **RLS de `match_goals`.** SELECT espelha `matches_select_visivel` (não vaza
  gols de rodada oculta). INSERT/DELETE derivam de quem grava placar direto:
  capacidade ARBITRAR no competitivo (`pode_arbitrar_torneio`) OU participante
  do avulso em partida liberada — espelho de `matches_update_tournament_owner`
  + `matches_update_participant`. A materialização pelo fluxo de proposta ocorre
  dentro da RPC SECURITY DEFINER (sem policy dedicada ao técnico).
- **Fluxo DIRETO (`updateMatchScore`).** `updateMatchScoreSchema` ganha um campo
  OPCIONAL `autores: {lado, jogador, gols}[]` (Zod: nome `btrim` 1..60, gols
  1..99, soma por lado ≤ placar daquele lado, sem duplicar autor no mesmo lado).
  Após o UPDATE de placar bem-sucedido, a action SUBSTITUI os gols daquela
  partida (delete-then-insert por `match_id`). Sem o campo → comportamento atual
  intacto.
- **Fluxo PROPOSTA (`proporPlacar` + RPC).** `proporPlacarSchema` ganha o mesmo
  `autores` opcional; `proporPlacar` grava em `match_score_proposals.autores`. A
  RPC `aprovar_proposta_placar` (SECURITY DEFINER, atômica) passa a LER esse
  jsonb e materializar em `match_goals` (delete-then-insert, agregando por lado +
  nome normalizado) no mesmo passo em que copia o placar e encerra — atomicidade
  preservada. A rejeição descarta os autores junto com a proposta (cascade).
- **Camada de dados (para a UI).** Funções `server-only`:
  `getScorerSuggestions` (autocomplete: nomes que aquele competidor já usou,
  por frequência), `getArtilharia` (ranking por competição/torneio, resolvendo
  lado→competidor) e `getArtilheirosDoCompetidor` (artilheiros da carreira de um
  competidor, para a página do competidor). O ranking/carreira é por
  `(competidor, nome_normalizado)` — "Endrick (do Ataias)" ≠ "Endrick (do João)".
- **UI (outro specialist, MESMA change).** Modal de placar ganha captura
  opcional dos autores (nome livre + autocomplete por competidor); nova seção de
  **ranking de artilharia** na competição; seção de **artilheiros** na página do
  competidor.

## Capabilities

### New Capabilities
- `goal-scorers`: captura de autores de gols (opcional, nome livre +
  autocomplete por competidor), ranking de artilharia por competição, e
  artilheiros na carreira do competidor. Artilheiro separado por competidor.

### Modified Capabilities
- `data-model`: tabela `match_goals` e coluna `match_score_proposals.autores`.
- `match-mutations`: `updateMatchScore` aceita e persiste os autores dos gols.
- `match-result-approval`: a proposta carrega os autores e a aprovação os
  materializa atomicamente.
- `row-level-security`: policies de `match_goals` (leitura por visibilidade da
  partida; escrita por quem grava placar direto).

## Impact

- **Código de aplicação:**
  - `src/schema/matchSchema.ts` (schema `autorGolSchema` + `autores` em
    `updateMatchScoreSchema` e `proporPlacarSchema`, com checagem de soma/lado e
    anti-duplicata).
  - `src/actions/match.ts` (`updateMatchScore` substitui `match_goals` após o
    placar).
  - `src/actions/scoreProposals.ts` (`proporPlacar` lê/grava `autores`).
  - `src/features/match/data/getScorerSuggestions.ts` (autocomplete).
  - `src/features/league/data/getArtilharia.ts` (ranking por competição).
  - `src/features/league/data/getArtilheirosDoCompetidor.ts` (carreira do
    competidor).
  - **UI (outro specialist):** modal de placar (`MatchScoreModal`/
    `OpenMatchesList`), tela de ranking de artilharia da competição, seção de
    artilheiros na página do competidor (`CompetidorHero`/perfil).
- **Banco de dados:** DDL ADITIVO em `supabase/schema.sql` (fonte de verdade) +
  `openspec/changes/add-artilharia/ddl.sql` com pré-checagens. Idempotente
  (`create table if not exists`, `add column if not exists`, `create ... if not
  exists`, `drop policy if exists` + `create policy`, `create or replace
  function`). O SQL de produção é MOSTRADO ao dono antes de aplicar (REGRA 4) —
  esta change documenta, não aplica.
- **Segurança/autorização:** a captura direta herda a MESMA autorização do
  lançamento de placar (ARBITRAR no competitivo, participante no avulso); a
  materialização por proposta ocorre na RPC SECURITY DEFINER já autorizada. RLS
  de leitura de `match_goals` espelha a de `matches` (sem vazar rodada oculta).
- **Dependências:** nenhuma nova.
- **Testes:** Zod dos autores (soma por lado ≤ placar; nome/gols inválidos;
  duplicata); `updateMatchScore` (grava/substitui `match_goals`; rejeita autores
  excedendo; sem autores = atual); `proporPlacar` (guarda `autores`); funções de
  dados (ranking resolve o competidor certo; autocomplete escopado por
  competidor). Supabase mockado; suíte atual permanece verde.
