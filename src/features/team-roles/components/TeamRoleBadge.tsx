import { Crown, Gavel, Shield, Star } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { PapelMembro } from "@/schema/equipe"

/**
 * Papel exibido na linha de membro. `dono` é um pseudo-papel da UI (não existe
 * em `tournament_members.papel`): o criador do campeonato comanda sem precisar
 * de linha de membro, então a página o sinaliza à parte (ehDono) e nós o
 * pintamos como a coroa de maior precedência.
 */
export type PapelExibido = PapelMembro | "dono"

const META: Record<
  PapelExibido,
  { rotulo: string; icon: LucideIcon; classes: string }
> = {
  dono: {
    rotulo: "Dono",
    icon: Crown,
    classes: "border-gold/30 bg-gold/10 text-gold-ink",
  },
  admin: {
    rotulo: "Admin",
    icon: Star,
    classes: "border-primary/30 bg-primary/10 text-primary",
  },
  arbitro: {
    rotulo: "Árbitro",
    icon: Gavel,
    classes: "border-border bg-muted/40 text-muted-foreground",
  },
  moderador: {
    rotulo: "Moderador",
    icon: Shield,
    classes: "border-border bg-muted/40 text-muted-foreground",
  },
}

/**
 * Pílula do papel de um membro (espelha o visual da `StatusPill`). O ícone é
 * decorativo (`aria-hidden`); o rótulo textual carrega a semântica.
 */
export function TeamRoleBadge({ papel }: { papel: PapelExibido }) {
  const { rotulo, icon: Icon, classes } = META[papel]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {rotulo}
    </span>
  )
}
