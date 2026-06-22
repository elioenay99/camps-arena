## 1. Schema

- [x] 1.1 `alvoRecolhimentoSchema` (`src/schema/liberacaoSchema.ts`): discriminated union `{ tipo: "tudo" } | { tipo: "rodada", rodada: N>=1 } | { tipo: "faseGrupos" }` + tipo `AlvoRecolhimento`.

## 2. Action

- [x] 2.1 `recolherRodadas(tournamentId, alvo)` (`src/actions/tournaments.ts`): valida id+alvo; `podeArbitrar`; gate `status != 'encerrado'`; UPDATE `liberada_em = null` WHERE `tournament_id` + **`.lte("liberada_em", now)`** (efetivamente liberadas; NÃO `is not null` — não toca agendadas futuras) + filtro do alvo (`rodada` → `.eq`; `faseGrupos` → `.not grupo is null`; `tudo` → sem filtro); `.select("id")` conta `recolhidas`; retorna `{ ok, recolhidas }`; `revalidatePath`. SEM notificação.

## 3. UI

- [x] 3.1 `LiberarRodadasButtons` (`src/features/match/components/`): remover early-return "Todas as rodadas estão liberadas"; renderizar Liberar quando `proximaRodadaOculta !== null` e Recolher quando `rodadasLiberacao.some(r => r.liberada)`.
- [x] 3.2 Botões de recolher: "Recolher última rodada" (`{ tipo: "rodada", rodada: maior liberada }`), "Recolher fase de grupos" (se `ehGrupos`), "Recolher tudo" (confirmação inline). Toast com `recolhidas`. **Estado `confirmando: null | "liberar" | "recolher"`** (NÃO booleano único — evita colisão Liberar/Recolher tudo no estado misto).

## 4. Testes

- [x] 4.1 `alvoRecolhimentoSchema`: aceita as 3 variantes; rejeita `ate`/inválido.
- [x] 4.2 `recolherRodadas`: id/alvo inválido (sem banco); sem sessão; sem capacidade; torneio encerrado; sucesso por alvo (filtro certo + `.is not null`); conta `recolhidas`; NÃO chama notificações.

## 5. Gates de qualidade

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes.
- [x] 5.2 Revisão adversarial (workflow de subagentes indisponível — API 529 overload em 3 tentativas; substituído por review manual adversarial das 4 lentes com evidência de código/schema): 0 `must_fix`, 0 `should_fix`. Confirmado: subset `pode_arbitrar_torneio ⊆ pode_ver_bastidores_torneio` (contagem confiável), `rodadasLiberacao` ordenado asc (`ultimaLiberada` correto), paridade com `liberarRodadas`, teste espelha `round-release.test.ts`.
- [x] 5.3 Validação ao vivo (browser 390px, ataias, Supabase local, torneio "Liberacao Validacao"): estado misto mostra liberar+recolher; recolher última rodada (com partida encerrada) → `liberada_em=null` + placar/status intactos; liberar tudo (6) → recolher tudo (6) → todas ocultas; dev server 0 erros. DB conferido a cada passo.

## 6. Arquivar

- [x] 6.1 `openspec archive add-recolher-rodadas`; commit (pt-BR, sem coautoria); push.
