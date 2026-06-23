import { z } from "zod"

/** Termo de busca de clube: mínimo 3 caracteres (exigência da API-Football). */
export const teamSearchSchema = z
  .string()
  .trim()
  .min(3, "Digite ao menos 3 caracteres.")
  .max(60, "Busca muito longa.")

/**
 * Host confiável dos escudos (mesma origem liberada em `next.config.ts` para
 * `next/image`). Mantê-los em sincronia: se um mudar, o outro também muda.
 */
export const ESCUDO_HOST = "media.api-sports.io"

/** Prefixo confiável (espelha a CHECK `like 'https://media.api-sports.io/%'`). */
const ESCUDO_PREFIXO = `https://${ESCUDO_HOST}/`

/**
 * URL de escudo: `null` OU URL `https` no host confiável e no path de escudo do
 * `next.config.ts` (`/football/teams/**`). Fecha o poison do cache global `teams`
 * com URLs arbitrárias e mantém Zod, a CHECK do banco e o `next.config` em
 * sincronia. `null` é aceito via `.nullable()` (ignora o refine).
 */
const escudoUrlSchema = z
  .string()
  .refine((valor) => {
    // 1) Prefixo no string cru espelha a CHECK do banco e barra porta/userinfo/
    //    sufixo de domínio (ex.: `:443`, `x@host`, `host.evil.com`).
    if (!valor.startsWith(ESCUDO_PREFIXO)) return false
    // 2) Parse confirma host/protocolo e exige o path de escudo (não domínio nu).
    try {
      const url = new URL(valor)
      return (
        url.protocol === "https:" &&
        url.hostname === ESCUDO_HOST &&
        url.pathname.startsWith("/football/teams/")
      )
    } catch {
      return false
    }
  }, "Escudo de domínio não confiável.")
  .nullable()

/** Clube normalizado a partir da API (e contrato de seleção/cache). */
export const teamResultSchema = z.object({
  externalId: z.string().regex(/^\d+$/, "Identificador de clube inválido."),
  // .trim() espelha o `char_length(btrim(nome)) between 1 and 80` do CHECK do banco
  // (nome só-de-espaços recusado nas duas camadas).
  nome: z.string().trim().min(1).max(80, "Nome de clube muito longo."),
  escudoUrl: escudoUrlSchema,
})

export type TeamResult = z.infer<typeof teamResultSchema>

/** Input de `selectTeam` (cachear o clube escolhido). */
export const selectTeamSchema = teamResultSchema
export type SelectTeamInput = z.infer<typeof selectTeamSchema>
