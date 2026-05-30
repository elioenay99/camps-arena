import { z } from "zod"

/** Placar de um lado: inteiro não-negativo com teto sano. */
const placar = z.coerce
  .number({ error: "Placar inválido." })
  .int("O placar deve ser um número inteiro.")
  .min(0, "O placar não pode ser negativo.")
  .max(999, "Placar fora do intervalo permitido.")

export const updateMatchScoreSchema = z.object({
  matchId: z.uuid({ error: "ID de partida inválido." }),
  placar_1: placar,
  placar_2: placar,
})

export type UpdateMatchScoreInput = z.infer<typeof updateMatchScoreSchema>
