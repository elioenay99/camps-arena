## 0. Baseline

- [x] 0.1 Capturar baseline do HEAD: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
  Verde final = igual ao baseline.

## 1. RPC atômica em `schema.sql`

- [x] 1.1 Criar `public.aplicar_placar_direto(p_match_id, p_placar_1, p_placar_2,
  p_autores jsonb default null, p_expected_status text default null)` — `security
  definer`, `set search_path = ''`, `auth.uid()` → `AUTH_REQUIRED`.
- [x] 1.2 `select ... for update` na `matches`; autz interna (participante do
  avulso via `coalesce(...)` OU `pode_arbitrar_torneio`) → `NAO_AUTORIZADO`.
- [x] 1.3 Guarda otimista no `UPDATE` (`status <> 'encerrada'` + `p_expected_status`)
  + `get diagnostics` → `PARTIDA_ENCERRADA`/`PARTIDA_INDISPONIVEL`.
- [x] 1.4 Autores: `null` preserva; array (incl. `[]`) → REPLACE dos DOIS lados
  com parse endurecido (guards de tipo + range no numeric) e teto por lado.
- [x] 1.5 Poda de invariante `soma do lado ≤ placar[lado]` na mesma transação.
- [x] 1.6 Grants idempotentes (`revoke ... from public, anon` + `grant ... to
  authenticated`); posicionada junto das RPCs de match; aplicável limpo em 2 passes.

## 2. Action `updateMatchScore`

- [x] 2.1 Substituir o bloco `UPDATE + DELETE + INSERT + poda` por UMA chamada
  `supabase.rpc('aplicar_placar_direto', {...})` com `p_autores = autores !==
  undefined ? agregarAutores(autores) : null` e `p_expected_status = match.status`.
- [x] 2.2 Mapear os `raise` da RPC (`PARTIDA_ENCERRADA`, `PARTIDA_INDISPONIVEL`,
  `NAO_AUTORIZADO`, `AUTH_REQUIRED`, genérico) para as mensagens pt-BR existentes.
- [x] 2.3 Manter as pré-guardas (autz, status encerrada, proposta pendente) e o
  `revalidatePath` + `enviarNotificacoes`.
- [x] 2.4 Adicionar o tipo de `aplicar_placar_direto` a `database.types.ts`.

## 3. Testes

- [x] 3.1 `src/actions/match.test.ts`: mock de `supabase.rpc('aplicar_placar_direto')`
  — asserts de args (placar, `p_autores` nulo vs agregado vs `[]`, `p_expected_status`)
  e mapeamento de cada erro. Preservar os casos de autz/pré-guarda.
- [x] 3.2 pgTAP (`supabase/tests/rls_match_goals.sql` ou novo arquivo): (a) sucesso
  aplica placar + autores; (b) rollback/atomicidade; (c) gol órfão acima do teto não
  sobrevive; (d) autz anon/não-participante barrada; (e) `encerrada` rejeitada; (f)
  guarda otimista com `p_expected_status` obsoleto → `PARTIDA_INDISPONIVEL`. Autz
  testada sob `anon`/`authenticated` (superuser bypassa grants).

## 4. Gate

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test` verde (igual ao baseline).
- [x] 4.2 `openspec validate fix-placar-replace-transacional --strict` = valid.
- [x] 4.3 Emitir o SQL da RPC entre `----SQL-F1-INICIO----`/`----SQL-F1-FIM----`
  para o orquestrador repassar ao dono (DDL aplicada manualmente).
