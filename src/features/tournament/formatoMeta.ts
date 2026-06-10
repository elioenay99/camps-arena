import { Boxes, LayoutGrid, ListOrdered, Network, Swords } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { TournamentFormat } from "@/lib/supabase/database.types"

/** Rótulo + ícone por formato — fonte única para cards/cabeçalhos de torneio. */
export const FORMATO_META: Record<
  TournamentFormat,
  { label: string; Icon: LucideIcon }
> = {
  avulso: { label: "Avulso", Icon: Swords },
  liga: { label: "Liga", Icon: ListOrdered },
  mata_mata: { label: "Mata-mata", Icon: Network },
  grupos_mata_mata: { label: "Grupos + mata-mata", Icon: Boxes },
  fase_liga: { label: "Fase de liga", Icon: LayoutGrid },
}
