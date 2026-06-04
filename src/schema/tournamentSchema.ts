import { z } from "zod"

/** Criação de torneio: título obrigatório e visibilidade (pública por padrão). */
export const createTournamentSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(2, "Informe um título com ao menos 2 caracteres.")
    .max(80, "Título muito longo."),
  isPublic: z.boolean().default(true),
})

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>
