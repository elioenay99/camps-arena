import { z } from "zod"

/**
 * Schemas da camada de GESTÃO DE EQUIPE (change add-equipe-campeonato).
 *
 * Dois eixos de papel, intencionalmente distintos:
 * - `papelConviteSchema`: papéis ofertáveis por LINK de convite — só árbitro e
 *   moderador. Admin NUNCA sai por link (eleva privilégio de quem tiver o
 *   código); admin é adição direta e dono-only (a RLS exige dono no INSERT).
 * - `papelMembroSchema`: papéis de uma LINHA de membro já existente — inclui
 *   admin (adicionado diretamente pelo dono).
 *
 * `escopoSchema` discrimina entre torneio avulso/competitivo (`tournament`) e
 * pirâmide/liga (`league`) — o app mapeia para `tournament_id`/`competition_id`.
 */
export const papelConviteSchema = z.enum(["arbitro", "moderador"])
export type PapelConvite = z.infer<typeof papelConviteSchema>

export const papelMembroSchema = z.enum(["admin", "arbitro", "moderador"])
export type PapelMembro = z.infer<typeof papelMembroSchema>

export const escopoSchema = z.enum(["tournament", "league"])
export type Escopo = z.infer<typeof escopoSchema>

/** Gerar/regenerar o link de convite de um papel (árbitro/moderador). */
export const gerarConviteMembroSchema = z.object({
  escopo: escopoSchema,
  id: z.uuid(),
  papel: papelConviteSchema,
})

/** Remover o link de convite de um papel. */
export const removerConviteMembroSchema = z.object({
  escopo: escopoSchema,
  id: z.uuid(),
  papel: papelConviteSchema,
})

/** Adicionar um membro diretamente (admin/arbitro/moderador). */
export const adicionarMembroSchema = z.object({
  escopo: escopoSchema,
  id: z.uuid(),
  userId: z.uuid(),
  papel: papelMembroSchema,
})

/** Remover um membro pelo seu user_id. */
export const removerMembroSchema = z.object({
  escopo: escopoSchema,
  id: z.uuid(),
  userId: z.uuid(),
})

/** Sair da equipe por conta própria. */
export const sairDaEquipeSchema = z.object({
  escopo: escopoSchema,
  id: z.uuid(),
})

/** Aceitar um convite de membro pelo código. */
export const aceitarConviteMembroSchema = z.object({
  code: z.string().min(1),
})

/**
 * Busca de usuários por nome para nomeação. Mínimo de 2 caracteres já no Zod;
 * a action também faz o short-circuit (retorna [] sem consultar) antes disto,
 * mas o schema documenta o contrato.
 */
export const buscarUsuariosSchema = z.object({
  query: z.string().min(2).max(100),
})
