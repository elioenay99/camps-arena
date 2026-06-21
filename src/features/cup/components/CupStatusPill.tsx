import type { CupCompetitionStatus } from "@/lib/supabase/database.types"

import { CUP_COMPETITION_STATUS_LABEL } from "@/features/cup/cupLabels"

/**
 * Pílula de status da copa (config-mãe): "ativa" neutra-viva, "arquivada"
 * apagada. Diferente da pílula da EDIÇÃO (rascunho/montada/ativa/encerrada).
 */
export function CupStatusPill({ status }: { status: CupCompetitionStatus }) {
  const arquivada = status === "arquivada"
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        arquivada
          ? "border-border bg-muted/40 text-muted-foreground"
          : "border-primary/30 bg-primary/10 text-primary"
      }`}
    >
      {CUP_COMPETITION_STATUS_LABEL[status]}
    </span>
  )
}
