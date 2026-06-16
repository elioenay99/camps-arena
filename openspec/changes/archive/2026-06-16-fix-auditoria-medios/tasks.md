# Tasks — fix-auditoria-medios

Gate: cada frente atualiza código E testes afetados; RSC preservado; gates typecheck/lint/test/build
verdes ao final; revisão adversarial do diff; validação visual a11y (2 temas + 390px).

## 1. a11y — erro por campo nos forms (WCAG 3.3.1/1.3.1)
- [x] 1.1 Associado (id + aria-describedby + role=alert) em Login/Signup/Profile/Forgot/Change/Update/
  MatchCreate/TournamentForm. Forms nativos (FormData+useActionState) → atributos manuais consistentes.
- [x] 1.2 Idem em `ui/color-field.tsx` (merge erro+descrição no aria-describedby).
- [x] 1.3 Testes: color-field.test (6) + ProfileForm.test (representa o padrão). + fieldsets Formato/Clubes/
  Nomes do TournamentForm ganharam id no erro + `aria-describedby` no `<fieldset>` (fix do review).

## 2. tipos — status de W.O.
- [x] 2.1 `WoRequestStatus` union nas 3 projeções de `match_wo_requests`; usado em `wo.ts` (novoStatus).
- [x] 2.2 Removido `eh_co_participante` do bloco `Functions` (RPC não-chamável; grep confirma 0 usos).

## 3. a11y — vencedor da chave (WCAG 1.4.1)
- [x] 3.1 Sinal não-cromático no vencedor (sr-only "vencedor" + troféu decorativo `aria-hidden`).
- [x] 3.2 Testes BracketView 15→ (anúncio único; W.O. 0x0; aberto). **Fix do review:** anúncio era emitido
  1×/perna → 2× em ida-e-volta; separado o destaque cromático (por perna) do ANÚNCIO (1×/confronto via
  `idxAnuncio` = perna decisiva). + teste de ida-e-volta encerrada (getAllByText "vencedor" === 1).

## 4. a11y — alvos de toque >=40px (ações irreversíveis)
- [x] 4.1 `min-h-10 px-4` em WoButtons, MatchStatusButton, SlotInviteButtons, InviteControls, header (Sair).
  Containers com gap-x-6 (>=24px entre alvos). button.tsx base intacto. **Fixes do review/validação:**
  Copy buttons (InviteControls/SlotInviteButtons) elevados a 40px p/ não destoar das ações irmãs; e
  TournamentLifecycleButtons (Encerrar/Reabrir/Confirmar/Cancelar) elevados (estavam a 28px — achado da
  validação visual). Confirmado ao vivo: Encerrar torneio = 40px, sem overflow em 390px.

## 5. perf — fan-out da página da liga
- [x] 5.1 `getSeasonBoundaries.ts` (React cache por seasonId, superset de colunas) substitui o re-fetch
  N+2 de league_boundaries em getDivisionStandings/getPlayoffs. Matches já eram cache()-dedup. Classificação
  por usuário PRESERVADA (vem da RLS de matches, não tocada; página é só do dono).
- [x] 5.2 Sem testes diretos das funções server-only; nenhum mock congelava o shape — nada a atualizar.

## 6. Gates + revisão
- [x] 6.1 `typecheck && lint && test && build` VERDE (1097 testes, +12 vs base).
- [x] 6.2 Revisão adversarial (workflow, 4 lentes): 11→7 confirmados, **0 must_fix**; 2 should_fix + 1
  achado da validação aplicados.
- [x] 6.3 Validação visual a11y ao vivo: login/torneio em 390px sem overflow; Sair/W.O./Encerrar(partida e
  torneio) = 40px; não-críticos preservados. Bracket coberto pelos testes (sem dados de mata-mata na conta).

## 7. Encerramento
- [x] 7.1 Commits por frente (pt-BR, sem coautoria) + push.
- [x] 7.2 `openspec archive fix-auditoria-medios` + atualizar [[arena-auditoria-2026-06-15]].
