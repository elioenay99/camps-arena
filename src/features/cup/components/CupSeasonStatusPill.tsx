import type { CupSeasonStatus } from "@/lib/supabase/database.types"

import { CUP_SEASON_STATUS_LABEL } from "@/features/cup/cupLabels"

/**
 * Pílula de status de uma edição de copa — fonte única (índice + página da copa
 * + página da edição). "Em disputa" (ativa) ganha o ponto vivo; "encerrada" usa
 * o dourado de conquista; "montada" é accent (pronta para iniciar); "rascunho"
 * fica neutro. Espelha SeasonStatusPill/StatusPill.
 */
export function CupSeasonStatusPill({ status }: { status: CupSeasonStatus }) {
  const ativa = status === "ativa"
  const montada = status === "montada"
  const encerrada = status === "encerrada"
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ativa
          ? "border-primary/30 bg-primary/10 text-primary"
          : encerrada
            ? "border-gold/30 bg-gold/10 text-gold-ink"
            : montada
              ? "border-accent/30 bg-accent/10 text-accent-foreground"
              : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {ativa ? (
        <span
          className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ) : null}
      {CUP_SEASON_STATUS_LABEL[status]}
    </span>
  )
}
