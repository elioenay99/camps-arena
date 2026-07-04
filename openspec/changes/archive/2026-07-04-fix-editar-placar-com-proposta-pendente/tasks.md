## 0. Baseline

- [x] 0.1 Baseline HEAD `a8a995a`: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test`
  1395/1395 ✓ (102 arquivos). Zero falhas pré-existentes — verde final = igual ao baseline.

## 1. Confirmar a causa-raiz / diagnóstico

- [x] 1.1 `updateMatchScore` (`src/actions/match.ts:73`) NÃO tem caminho que estoure por
  proposta pendente; todos os erros reais viram `{ok:false, error:"...pt-BR..."}`. O erro em
  inglês do repro é skew de Server Action (um refresh resolve) — fora de escopo.
- [x] 1.2 `enviarNotificacoes` (`src/features/notifications/enviar.ts`) é best-effort e NUNCA
  lança (todo o corpo sob try/catch). Nenhum outro throw não-tratado no caminho feliz.

## 2. Plumbing do `matchId` em `getPropostasPendentes`

- [x] 2.1 `src/features/match/data/getPropostasPendentes.ts`: adicionar `matchId: string` à
  interface `PropostaPendente` e ao `.map` (trazendo `match.id`/`match_id` do embed
  `matches!...!inner`). Aditivo — não quebra consumidores atuais.

## 3. Conjunto de pendências na page do torneio

- [x] 3.1 `src/app/dashboard/torneios/[id]/page.tsx`: montar
  `matchesComPropostaPendente = new Set(propostasPendentes.map((p) => p.matchId))` e passar ao
  `OpenMatchesList`. (Vazio quando não-arbitro/não-gerado → gate no-op.)

## 4. Gate + indicador no `OpenMatchesList`

- [x] 4.1 `src/features/match/components/OpenMatchesList.tsx`: aceitar
  `matchesComPropostaPendente?: Set<string>` (default vazio).
- [x] 4.2 Gatear "Editar placar", "Encerrar" e "W.O." com `!matchesComPropostaPendente.has(p.id)`;
  no lugar, indicador discreto "Aguardando aprovação de placar" (ícone `Clock` +
  `text-muted-foreground`). "Chamar" e "Solicitar W.O." de quem joga permanecem.

## 5. Guarda no servidor (defesa em profundidade — rework should_fix)

- [x] 5.1 `updateMatchScore` (`src/actions/match.ts`), ANTES do UPDATE e só no caminho
  `!ehAvulso`: consulta `match_score_proposals` (match_id + status=pendente, limit 1); se houver,
  retorna `{ok:false, error:"Há uma proposta de placar aguardando aprovação. Aprove ou rejeite
  antes de editar o placar direto."}`. Fecha a corrida de aba velha / POST direto.

## 6. Testes discriminantes

- [x] 6.1 `MatchListsRodada.test.tsx`: partida COM matchId no Set NÃO renderiza "Editar placar"
  (nem "Encerrar"/"W.O.") e mostra o indicador; partida SEM pendência renderiza normal. A mutação
  que remove o gate faz o teste falhar.
- [x] 6.2 Teste de `getPropostasPendentes` devolvendo `matchId` (mapeia `match.id` → `matchId`).
- [x] 6.3 `match.test.ts`: `updateMatchScore` recusa limpo com proposta pendente (não grava) E
  segue gravando sem proposta; avulso nem consulta `match_score_proposals`.

## 7. Gate

- [x] 7.1 `pnpm typecheck && pnpm lint && pnpm test` — verde (igual ao baseline 0.1). O build é
  rodado pelo orquestrador.
- [x] 7.2 `openspec validate fix-editar-placar-com-proposta-pendente --strict` = valid.
- [x] 7.3 Rework da review: should_fix (guarda no servidor, task 5.1) + 3 nits (indicador nomeia
  o caminho; comentário do Set em page.tsx corrigido — pode ficar não-vazio pro jogador, inócuo;
  comentário do `?? ""` em getPropostasPendentes).
- [ ] 7.4 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 7.5 Validação visual ao vivo (390px): abrir uma partida competitiva com proposta pendente
  como organizador e confirmar que "Editar placar" some e o indicador aparece. (ORQUESTRADOR)
