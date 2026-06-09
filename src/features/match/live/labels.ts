import type { MatchStatus } from "@/lib/supabase/database.types"

/** Rótulo humano (pt-BR) de cada status de partida. Fonte única para o card
 * (RSC) e para as folhas de tempo real (client). */
export const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}
