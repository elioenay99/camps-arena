import { z } from "zod"

/**
 * Código de convite vindo da URL (`/convite/[codigo]`) ou de form. Aceita um
 * intervalo maior que o formato gerado hoje (16 chars Crockford base32
 * minúsculo) para não invalidar códigos de gerações futuras; o que importa é
 * barrar lixo óbvio antes da RPC (a validação REAL do segredo é no banco).
 */
export const codigoConviteSchema = z
  .string({ error: "Convite inválido." })
  .regex(/^[a-z0-9]{8,64}$/, "Convite inválido.")

export const aceitarConviteSchema = z.object({
  codigo: codigoConviteSchema,
})

export const sairDoTorneioSchema = z.object({
  tournamentId: z.uuid({ error: "Torneio inválido." }),
})

export const removerParticipanteSchema = z.object({
  tournamentId: z.uuid({ error: "Torneio inválido." }),
  userId: z.uuid({ error: "Participante inválido." }),
})

export const regenerarConviteSchema = z.object({
  tournamentId: z.uuid({ error: "Torneio inválido." }),
})

export type AceitarConviteInput = z.infer<typeof aceitarConviteSchema>
export type SairDoTorneioInput = z.infer<typeof sairDoTorneioSchema>
export type RemoverParticipanteInput = z.infer<typeof removerParticipanteSchema>
export type RegenerarConviteInput = z.infer<typeof regenerarConviteSchema>
