/**
 * Status de uma temporada de pirâmide. Espelha o enum
 * `public.league_season_status` do banco. Mantido em módulo próprio (sem
 * "use server"/"server-only") para ser importável tanto por RSC quanto por
 * client leaves (a pílula é compartilhada).
 */
export type LeagueSeasonStatus = "rascunho" | "ativa" | "em_fluxo" | "encerrada"

/** Rótulo pt-BR de cada status — fonte única (índice + página da temporada). */
export const LEAGUE_SEASON_STATUS_LABEL: Record<LeagueSeasonStatus, string> = {
  rascunho: "Rascunho",
  ativa: "Em disputa",
  em_fluxo: "Sobe e cai",
  encerrada: "Encerrada",
}
