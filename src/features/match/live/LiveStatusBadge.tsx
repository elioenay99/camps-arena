"use client"

import { useLiveMatch } from "@/features/match/live/LiveMatchesProvider"
import { LABEL_STATUS } from "@/features/match/live/labels"
import type { MatchStatus } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

/** Cápsula de status da partida que reage ao Realtime, com o texto acessível
 * acompanhando. Fora de um provider mostra o status inicial da RSC. */
export function LiveStatusBadge({
  matchId,
  initial,
}: {
  matchId: string
  initial: MatchStatus
}) {
  const live = useLiveMatch(matchId)
  const status = live ? live.status : initial
  const emAndamento = status === "em_andamento"

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
          emAndamento
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground"
        )}
      >
        {emAndamento ? (
          <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
        ) : null}
        {LABEL_STATUS[status]}
      </span>
      <span className="sr-only">{` • ${LABEL_STATUS[status]}`}</span>
    </>
  )
}
