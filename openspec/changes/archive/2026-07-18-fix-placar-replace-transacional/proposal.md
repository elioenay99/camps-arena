## Why

`updateMatchScore` (`src/actions/match.ts`) grava o placar DIRETO em **3 escritas
PostgREST separadas e NÃO-transacionais**: `UPDATE matches` (placar) → `DELETE
match_goals` dos dois lados → `INSERT match_goals` → poda de invariante `soma do
lado ≤ placar`. O próprio comentário do código admite "Não-transacional (MVP)".

Isso abre uma janela de corrupção real:

- Se o `DELETE` ou o `INSERT` de autores falhar, o **placar já foi salvo** e a
  artilharia fica inconsistente com ele.
- Pior: no early-return de falha do `DELETE` (a action retorna antes da poda de
  invariante), gols antigos acima do NOVO teto ficam ÓRFÃOS — e podem ser
  materializados na **foto imutável do hall da fama** (corrupção irreversível), o
  mesmo risco que a `aprovar_proposta_placar` já fecha atomicamente.
- Entre a leitura da partida (checagem de status/propriedade) e o `UPDATE` há um
  check-then-act não-atômico: dois editores concorrentes fazem last-write-wins
  silencioso, e uma partida encerrada sob os pés do editor só é barrada pelo
  trigger (mensagem crua), não por uma guarda otimista.

A `aprovar_proposta_placar` já resolve exatamente esses problemas para o caminho
da PROPOSTA (transação `SECURITY DEFINER`, `for update`, parse endurecido, poda de
invariante na mesma transação). O caminho do lançamento DIRETO ficou para trás.

## What Changes

Move as 3 escritas para uma RPC `SECURITY DEFINER` atômica, espelhando a
`aprovar_proposta_placar` mas com a semântica do modal direto (REPLACE dos DOIS
lados; NÃO encerra a partida).

- **Nova RPC `public.aplicar_placar_direto(p_match_id, p_placar_1, p_placar_2,
  p_autores jsonb default null, p_expected_status text default null)`** em
  `supabase/schema.sql` (fonte de verdade — **NÃO aplicada** em banco; o dono
  aplica manualmente):
  - `security definer`, `set search_path = ''`, `auth.uid()` → `AUTH_REQUIRED`.
  - `select ... for update` na linha `matches` serializa a corrida.
  - **Writer autoritativo**: reproduz a autorização da action (participante do
    avulso OU `pode_arbitrar_torneio`) DENTRO da RPC — como ela é `definer` e
    bypassa RLS, a autz não pode depender de Zod/RLS (reforço, não barreira).
  - **Guarda otimista**: `UPDATE ... WHERE status <> 'encerrada' AND
    (p_expected_status IS NULL OR status = p_expected_status)` + `get diagnostics
    row_count = 0` → `PARTIDA_ENCERRADA` (se de fato encerrada) ou
    `PARTIDA_INDISPONIVEL` (partida mudou sob o editor). Mata o last-write-wins.
  - **Autores**: `p_autores = null` → PRESERVA os gols (só aplica placar + poda);
    array (incl. `[]`) → REPLACE dos DOIS lados (delete `[1,2]` + insert do
    conjunto endurecido). Parse à prova de forja (guards de tipo + range no
    numeric antes do `::int`) e teto `soma do lado ≤ placar` no servidor — item
    malformado é ignorado, jamais aborta.
  - **Invariante** `soma do lado ≤ placar[lado]` SEMPRE, na mesma transação (poda
    de órfãos ao reduzir o placar de um lado não-governado).
  - Grants idempotentes: `revoke ... from public, anon` + `grant ... to
    authenticated`.
- **`updateMatchScore`** substitui o bloco `UPDATE + DELETE + INSERT + poda` por
  UMA chamada `supabase.rpc('aplicar_placar_direto', {...})`, passando
  `p_autores = autores !== undefined ? agregarAutores(autores) : null` e
  `p_expected_status = match.status`. Mapeia os `raise` da RPC para as mensagens
  pt-BR JÁ existentes. Mantém as pré-guardas (autz, status encerrada, proposta
  pendente) para mensagens limpas e o `revalidatePath` + `enviarNotificacoes`.
- **Tipagem**: `aplicar_placar_direto` é adicionada a `database.types.ts`
  (as DDL não são geradas automaticamente; a entrada acompanha a fonte de verdade).

## Impact

- **DDL manual** (a RPC vai em `supabase/schema.sql`; o dono aplica). Idempotente,
  aplicável limpo nas DUAS passagens do CI (`create or replace`).
- **SEM mudança de dados existentes.** A semântica observável do fluxo direto é
  preservada (REPLACE dos dois lados; `undefined` preserva; poda de órfãos).
- Arquivos: `supabase/schema.sql` (nova RPC + grants), `src/actions/match.ts`
  (chamada única + mapeamento de erro), `src/lib/supabase/database.types.ts`
  (tipo da RPC), `src/actions/match.test.ts` (mock da RPC), `supabase/tests/`
  (pgTAP de atomicidade/rollback/autz/poda/guarda otimista).
- **Ganho**: fecha a janela de artilharia inconsistente e de gol órfão na foto do
  hall da fama; mata o last-write-wins; unifica o endurecimento de parse com o
  caminho da proposta.
