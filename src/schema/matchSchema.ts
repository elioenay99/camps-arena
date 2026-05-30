import { z } from "zod"

/** Teto sano de placar — compartilhado entre validação e clamp da UI. */
export const PLACAR_MAX = 999

/**
 * Placar de um lado: inteiro não-negativo com teto sano.
 * Sem `coerce` de propósito: o fluxo real (modal → action) transporta
 * `number`, e `z.coerce.number()` aceitaria lixo silenciosamente
 * ("" → 0, "0x10" → 16) num caminho alcançável por POST direto.
 */
const placar = z
  .number({ error: "Placar inválido." })
  .int("O placar deve ser um número inteiro.")
  .min(0, "O placar não pode ser negativo.")
  .max(PLACAR_MAX, "Placar fora do intervalo permitido.")

export const updateMatchScoreSchema = z.object({
  matchId: z.uuid({ error: "ID de partida inválido." }),
  placar_1: placar,
  placar_2: placar,
})

export type UpdateMatchScoreInput = z.infer<typeof updateMatchScoreSchema>

/** Associação de clube a um (ou ambos) lados da partida. */
export const updateMatchTeamsSchema = z
  .object({
    matchId: z.uuid({ error: "ID de partida inválido." }),
    time_1: z.uuid({ error: "Clube inválido." }).nullable().optional(),
    time_2: z.uuid({ error: "Clube inválido." }).nullable().optional(),
  })
  .refine((d) => d.time_1 !== undefined || d.time_2 !== undefined, {
    error: "Nada para atualizar.",
  })

export type UpdateMatchTeamsInput = z.infer<typeof updateMatchTeamsSchema>
