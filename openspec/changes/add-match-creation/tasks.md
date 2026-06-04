## 1. DDL (defesa em profundidade — usuário aplica)

- [x] 1.1 `supabase/schema.sql`: substituir `matches_select_public` por `matches_select_visivel` (visibilidade do torneio + participante)
- [x] 1.2 `supabase/schema.sql`: criar `matches_insert_tournament_owner` (`with check` dono do torneio + `t.status <> 'encerrado'`)

## 2. Validação (Zod) e Server Action

- [x] 2.1 `src/schema/matchSchema.ts`: `createMatchSchema` (`tournamentId` uuid; `participante1`/`participante2` uuid anuláveis; refine distintos) + tipo
- [x] 2.2 `src/actions/match.ts`: `createMatch(prev, formData)` — sessão via `getUser()`; valida; confere torneio do usuário e não encerrado (`maybeSingle`); insere só `{tournament_id, participante_1, participante_2}`; `revalidatePath`; `redirect("/dashboard")`; erros sem vazar detalhes

## 3. Data fetchers (RSC)

- [x] 3.1 `src/features/tournament/data/getOwnTournaments.ts`: torneios do usuário não encerrados (id, titulo)
- [x] 3.2 `src/features/match/data/getParticipantesDisponiveis.ts`: users (id, nome) ordenado por nome

## 4. UI

- [x] 4.1 `src/features/match/components/MatchCreateForm.tsx` (folha client; selects nativos; participantes opcionais "Definir depois")
- [x] 4.2 `src/app/dashboard/partidas/nova/page.tsx` (RSC protegida; sem torneio próprio elegível → orienta criar torneio)
- [x] 4.3 `src/app/dashboard/page.tsx`: botão "Nova partida"

## 5. Testes

- [x] 5.1 `src/schema/matchSchema.test.ts`: createMatchSchema — uuid inválido; participantes iguais rejeitados; nulos aceitos
- [x] 5.2 `src/actions/match.test.ts`: createMatch — inválido não toca o banco; sem sessão rejeita; torneio de outro/encerrado/inexistente rejeita sem inserir; insert só com campos permitidos; sucesso redireciona; erro do banco vira mensagem genérica; exceção tratada
- [x] 5.3 testes dos fetchers (filtros e mapeamento)

## 6. Validação

- [x] 6.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 6.2 `openspec validate add-match-creation --strict`
- [x] 6.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 6.4 `pnpm build` verde
- [x] 6.5 Atualizar `docs/pendencias-manuais.md` com o DDL desta change (ordem: SELECT estreitado antes/junto do INSERT)
- [ ] 6.6 (usuário) Aplicar o DDL no Supabase
