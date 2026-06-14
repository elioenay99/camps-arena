import { ArrowDown, ArrowUp, Minus } from "lucide-react"

import type { TemporadaHistorico } from "@/features/league/data/getCompetitorProfile"

/**
 * Pílula do DESTINO de uma temporada (sobe/cai/permanece). Espelha as zonas da
 * StandingsTable: `sobe` = primary (acesso), `cai` = destructive (queda),
 * `permanece` = muted. Ícone do lucide coerente (seta/traço); `aria-hidden` no
 * ícone — o texto da pílula já anuncia o destino. `null` (não consolidado) não
 * renderiza nada.
 */
export function DestinoPill({
  destino,
}: {
  destino: TemporadaHistorico["destino"]
}) {
  if (!destino) return null

  const config = {
    sobe: {
      rotulo: "Subiu",
      Icone: ArrowUp,
      classe: "border-primary/30 bg-primary/12 text-primary",
    },
    cai: {
      rotulo: "Caiu",
      Icone: ArrowDown,
      classe: "border-destructive/30 bg-destructive/12 text-destructive",
    },
    permanece: {
      rotulo: "Manteve",
      Icone: Minus,
      classe: "border-border bg-muted/50 text-muted-foreground",
    },
  }[destino]

  const { rotulo, Icone, classe } = config

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${classe}`}
    >
      <Icone className="size-3" aria-hidden="true" />
      {rotulo}
    </span>
  )
}
