## 1. DDL (defesa em profundidade — usuário aplica)

- [x] 1.1 `supabase/schema.sql`: em `tournaments`, `add column if not exists created_by uuid references public.users(id) on delete set null` e `is_public boolean not null default true`
- [x] 1.2 `supabase/schema.sql`: índice `tournaments_created_by_idx`
- [x] 1.3 `supabase/schema.sql`: reescrever RLS de `tournaments` — SELECT `is_public or created_by = auth.uid()`; INSERT `with check (created_by = auth.uid())`; UPDATE `using`/`with check (created_by = auth.uid())`; DELETE `using (created_by = auth.uid())`

## 2. Validação (Zod) e Server Action

- [x] 2.1 `src/schema/tournamentSchema.ts`: `createTournamentSchema` (`titulo` 2–80; `isPublic` boolean default true) + tipos
- [x] 2.2 `src/actions/tournaments.ts`: `createTournament(prev, formData)` — exige `getUser()`; valida; insere `{ titulo, is_public, created_by: user.id }`; `revalidatePath`; `redirect("/dashboard")`; erros tratados sem vazar

## 3. UI

- [x] 3.1 `src/features/tournament/components/TournamentForm.tsx` (folha client; checkbox "público" marcado por padrão)
- [x] 3.2 `src/app/dashboard/torneios/novo/page.tsx` (RSC protegida + checagem de sessão)
- [x] 3.3 `src/app/dashboard/page.tsx`: link "Novo torneio"

## 4. Testes

- [x] 4.1 `src/schema/tournamentSchema.test.ts`: título curto/longo rejeitado; isPublic default; trim
- [x] 4.2 `src/actions/tournaments.test.ts`: inválido não toca o banco; sem sessão rejeita; `created_by` = user.id no insert (não confia no cliente); sucesso redireciona; erro do banco vira mensagem genérica

## 5. Validação

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 5.2 `openspec validate add-tournament-ownership --strict`
- [x] 5.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 5.4 `pnpm build` verde
- [x] 5.5 Atualizar `docs/pendencias-manuais.md` com o DDL desta change
- [ ] 5.6 (usuário) Aplicar o DDL no Supabase
