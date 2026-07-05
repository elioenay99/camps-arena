import { Boxes, LayoutGrid, ListOrdered, Network, Swords } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { TournamentFormat } from "@/lib/supabase/database.types"

/** Rótulo + ícone + descrição curta por formato — fonte única para cards/
 * cabeçalhos de torneio e para o seletor de formato na criação. */
export const FORMATO_META: Record<
  TournamentFormat,
  { label: string; desc: string; Icon: LucideIcon }
> = {
  avulso: {
    label: "Avulso",
    desc: "Crie cada partida quando quiser",
    Icon: Swords,
  },
  liga: {
    label: "Pontos corridos",
    desc: "Todos contra todos, com tabela",
    Icon: ListOrdered,
  },
  mata_mata: {
    label: "Mata-mata",
    desc: "Eliminatórias — quem perde sai",
    Icon: Network,
  },
  grupos_mata_mata: {
    label: "Grupos + mata-mata",
    desc: "Grupos e depois eliminatórias",
    Icon: Boxes,
  },
  fase_liga: {
    label: "Fase de liga",
    desc: "Liga única + eliminatórias",
    Icon: LayoutGrid,
  },
}
