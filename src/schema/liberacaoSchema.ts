import { z } from "zod"

/**
 * Alvo da liberação de rodadas (change add-liberacao-rodadas). União
 * discriminada — cada variante vira um filtro no UPDATE de `matches`:
 * - `rodada`     → uma rodada específica;
 * - `ate`        → todas as rodadas até `rodada` (base do "liberar próximas N");
 * - `faseGrupos` → todas as partidas de fase de grupos (`grupo` não nulo);
 * - `tudo`       → todas as partidas ocultas do torneio.
 * A liberação só toca partidas com `liberada_em is null` (idempotente).
 */
export const alvoLiberacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("rodada"), rodada: z.number().int().min(1) }),
  z.object({ tipo: z.literal("ate"), rodada: z.number().int().min(1) }),
  z.object({ tipo: z.literal("faseGrupos") }),
  z.object({ tipo: z.literal("tudo") }),
])

export type AlvoLiberacao = z.infer<typeof alvoLiberacaoSchema>

/**
 * Alvo do RECOLHIMENTO de rodadas (change add-recolher-rodadas) — inverso da
 * liberação: cada variante vira um filtro no UPDATE que seta `liberada_em = null`
 * nas partidas EFETIVAMENTE liberadas (`liberada_em <= now()`):
 * - `rodada`     → uma rodada (base do "recolher última rodada");
 * - `faseGrupos` → todas as partidas de fase de grupos (`grupo` não nulo);
 * - `tudo`       → todas as partidas liberadas do torneio (volta a nenhuma).
 * Sem `ate`/`aPartirDe` (não expostos). Idempotente (só toca o que está liberado).
 */
export const alvoRecolhimentoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("rodada"), rodada: z.number().int().min(1) }),
  z.object({ tipo: z.literal("faseGrupos") }),
  z.object({ tipo: z.literal("tudo") }),
])

export type AlvoRecolhimento = z.infer<typeof alvoRecolhimentoSchema>
