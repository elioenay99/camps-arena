import { z } from "zod"

/** Termo de busca de clube: mínimo 3 caracteres (exigência da API-Football). */
export const teamSearchSchema = z
  .string()
  .trim()
  .min(3, "Digite ao menos 3 caracteres.")
  .max(60, "Busca muito longa.")

/** Clube normalizado a partir da API (e contrato de seleção/cache). */
export const teamResultSchema = z.object({
  externalId: z.string().min(1),
  nome: z.string().min(1),
  escudoUrl: z.string().nullable(),
})

export type TeamResult = z.infer<typeof teamResultSchema>

/** Input de `selectTeam` (cachear o clube escolhido). */
export const selectTeamSchema = teamResultSchema
export type SelectTeamInput = z.infer<typeof selectTeamSchema>
