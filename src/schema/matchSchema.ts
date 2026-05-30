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
