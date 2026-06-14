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
