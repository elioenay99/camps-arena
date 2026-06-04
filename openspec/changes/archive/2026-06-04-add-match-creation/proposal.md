## Why

Terceiro item do Tier 1. Hoje `matches` não tem INSERT policy (escrita negada a todos) — partidas só nascem semeadas à mão. E há uma **dívida de segurança registrada no (b)**: `matches_select_public` é `using (true)`, ou seja, a privacidade de torneio introduzida pelo ownership **não cobre leitura direta de `matches`** — qualquer um leria partidas de torneio privado consultando a tabela diretamente. O risco é latente (ainda não existe partida em torneio privado), e esta change DEVE fechá-lo ANTES de habilitar a criação de partida.

## What Changes

- **RLS de `matches` — SELECT estreitado** (fecha a dívida do Tier 1b): `matches_select_public` (`using (true)`) é substituída por `matches_select_visivel` — a partida é visível quando o torneio dela é visível (`is_public OR created_by = auth.uid()`) **ou** quando o solicitante é participante da partida (participante vê a própria partida mesmo em torneio privado de terceiro — ele precisa lançar placar).
- **RLS de `matches` — INSERT** (`matches_insert_tournament_owner`): só o **dono do torneio** cria partidas nele, e apenas se o torneio não estiver `encerrado` (falha-segura: `t.status <> 'encerrado'`).
- **Server Action `createMatch`** (`src/actions/match.ts`): exige sessão; valida com Zod; confere no servidor que o torneio é do usuário e não está encerrado; insere `{ tournament_id, participante_1, participante_2 }` (status/placar pelos defaults do banco); `revalidatePath` + `redirect("/dashboard")`. Segurança em profundidade: checagem na action + RLS.
- **Schema** `createMatchSchema` (`src/schema/matchSchema.ts`): `tournamentId` uuid; `participante1`/`participante2` uuid anuláveis; refine `participante1 <> participante2` (espelha a CHECK `matches_participantes_distintos`).
- **Data (RSC)**: `getOwnTournaments` (`src/features/tournament/data/`) — torneios do usuário não encerrados, para o select do form; `getParticipantesDisponiveis` (`src/features/match/data/`) — `users` (id, nome) para os selects de participante.
- **UI**: página `/dashboard/partidas/nova` (RSC protegida) + `MatchCreateForm` (folha client, selects nativos — sem shadcn Select no projeto, mesma decisão do checkbox nativo do Tier 1b) + botão "Nova partida" no dashboard. Sem torneio próprio elegível, a página orienta a criar um torneio primeiro.
- **Testes**: action (`createMatch`), schema e data fetchers.

## Capabilities

### New Capabilities
- `match-creation`: criação de partida pelo dono do torneio via Server Action.

### Modified Capabilities
- `row-level-security`: `matches` deixa de ser leitura pública irrestrita; SELECT segue a visibilidade do torneio (+ participante) e INSERT é restrito ao dono do torneio.

## Impact

- **Código**: `src/actions/match.ts` (+`createMatch`), `src/schema/matchSchema.ts` (+schema), `src/features/tournament/data/getOwnTournaments.ts` (novo), `src/features/match/data/getParticipantesDisponiveis.ts` (novo), `src/app/dashboard/partidas/nova/page.tsx` (novo), `src/features/match/components/MatchCreateForm.tsx` (novo), `src/app/dashboard/page.tsx` (botão).
- **Banco (DDL manual)**: `supabase/schema.sql` — 2 policies (1 substituída + 1 nova). **needs_db = true**; instruções em `docs/pendencias-manuais.md`. **Ordem importa**: o SELECT estreitado deve ser aplicado junto/antes do INSERT — nunca habilitar INSERT com o SELECT ainda `using (true)`.
- **Impacto no dashboard (esperado)**: `getActiveMatches` já embute `tournaments!inner` com RLS de torneio aplicada; com o SELECT de `matches` estreitado, a linha da partida em si também respeita a visibilidade. Dados semeados são públicos (`is_public = true`) → nada muda hoje. **Limitação conhecida**: a cláusula de participante do SELECT vale para RLS/actions, mas o `!inner` do dashboard filtra pelo TORNEIO — participante em torneio privado de terceiro não enxerga o card até existir tela própria (Tier 3; registrado em design.md/Riscos).
- **Não-impacto**: `matches_update_participant` continua igual (participante lança placar); triggers `lock_match_relations`/`set_updated_at` intactos; `database.types.ts` sem mudança (Insert já modela as colunas).
- **Fora de escopo**: editar/excluir partida pela UI; seleção de clube no momento da criação (já existe fluxo próprio pós-criação via modal); agendamento/data da partida; standings (Tier 2).
