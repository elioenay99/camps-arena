# Tasks — add-tournament-participants

## 1. Banco (fonte de verdade + pendências manuais)

- [x] 1.1 `supabase/schema.sql`: tabelas `participants` e `tournament_invites` (PKs, FKs cascade, UNIQUE do code, índices), idempotentes
- [x] 1.2 `supabase/schema.sql`: funções `eh_participante(uuid)`, `aceitar_convite(text)`, `info_convite(text)` (`security definer`, `search_path=''`, mensagens pt-BR)
- [x] 1.3 `supabase/schema.sql`: RLS de `participants` (select por visibilidade do torneio; insert só dono-si-mesmo; delete próprio-ou-dono) e `tournament_invites` (tudo só dono)
- [x] 1.4 `supabase/schema.sql`: atualizar `tournaments_select_visivel`, `matches_select_visivel` (cláusula `eh_participante`) e `matches_insert_tournament_owner` (participantes ∈ participants)
- [x] 1.5 `docs/pendencias-manuais.md`: seção 8 com SQL pronto (DDL completa + backfill opcional de donos/invites + checagens manuais das funções e policies + rollback)

## 2. Lib e schemas

- [x] 2.1 `src/lib/invite-code.ts`: gerador (crypto.getRandomValues, alfabeto sem ambíguos, 16 chars) + testes
- [x] 2.2 `src/schema/participantSchema.ts`: schemas Zod (código de convite, sair/remover, regenerar) + testes
- [x] 2.3 Atualizar tipos do banco (`participants`, `tournament_invites`, RPCs) nos tipos Supabase mantidos à mão

## 3. Server Actions

- [x] 3.1 `src/actions/participants.ts`: `aceitarConvite` (rpc `aceitar_convite`, redirect ao torneio), `sairDoTorneio`, `removerParticipante` (dono, por filtro sem oráculo), `regenerarConvite` (dono; upsert com retry de colisão) — padrão FormState/Result + `.select()` confirmando escrita
- [x] 3.2 `tournaments.ts#createTournament`: inserir dono em `participants` + gerar invite após o INSERT do torneio (falha complementar não derruba a criação)
- [x] 3.3 `match.ts#createMatch`: validar participantes ∈ `participants` do torneio; redirect passa a `/dashboard/torneios/[id]`
- [x] 3.4 Testes vitest das actions novas e modificadas (mocks do supabase; cobrir auth, propriedade, código inválido, torneio encerrado, idempotência, colisão de código)

## 4. Fetchers

- [x] 4.1 `src/features/tournament/data`: `getParticipantesDoTorneio(id)` (via RLS), `getConviteDoTorneio(id)` (dono), `getMeusTorneios()` (organizo/participo) — só colunas necessárias (sem celular)
- [x] 4.2 `getParticipantesDisponiveis` substituído/redirecionado para participantes do torneio (remover listagem global de users do fluxo de partida)
- [x] 4.3 `getTournamentClassificacao`: expor `created_by`/flags já existentes conforme necessidade da página (sem query nova)

## 5. UI

- [x] 5.1 Rota pública `/convite/[codigo]`: deslogado → CTAs login/cadastro com `redirectTo` seguro; logado → info via `info_convite` + botão "Entrar no torneio"; inválido → mensagem única; já participante → link ao torneio
- [x] 5.2 Página do torneio: seção Participantes (lista p/ todos; remover p/ dono; sair p/ participante) + seção Convite (link copiável, gerar/regenerar) p/ dono — componentes client mínimos (copiar, confirmações)
- [x] 5.3 `/dashboard/torneios/[id]/partidas/nova`: form gated (dono + não-encerrado → senão 404 único) com selects restritos aos participantes; botão "Nova partida" na página do torneio
- [x] 5.4 `/dashboard/partidas/nova` vira seletor de torneio (lista de links → rota aninhada); estado vazio orienta criar torneio
- [x] 5.5 `/dashboard/torneios` (índice Organizo/Participo + estado vazio) e link "Torneios" no NavLinks (ativo por prefixo)

## 6. Validação e gates

- [x] 6.1 Suíte completa verde (`pnpm test`), `pnpm typecheck`, `pnpm lint`
- [x] 6.2 Workflow adversarial multi-lente (RLS/security definer, actions, UI/rotas, specs-vs-código) antes de commitar; aplicar must_fix/should_fix
- [x] 6.3 Commits (proposal / implementação / archive), push e CI verde
- [x] 6.4 Atualizar memória persistente e destacar a pendência manual (seção 8) ao usuário
