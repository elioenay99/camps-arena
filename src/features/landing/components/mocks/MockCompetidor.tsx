import { ArrowUp, Trophy } from "lucide-react"

import { escudoPublicUrl } from "@/lib/escudos"
import { TeamCrest } from "@/features/team/components/TeamCrest"

/**
 * Mock FIEL da página de competidor (não screenshot): cabeçalho com escudo real +
 * chips de promédio/temporadas/títulos, espelhando o `CompetidorHero`/`HeroChip`.
 * Ensina "promédio" e "hall da fama". Dados curados hardcoded, decorativo
 * (`aria-hidden` na seção que o compõe). RSC puro.
 */
export function MockCompetidor() {
  return (
    <div className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-4">
      <div className="flex items-center gap-3">
        <TeamCrest
          nome="Palmeiras"
          escudoUrl={escudoPublicUrl(121)}
          size={52}
          className="ring-1 ring-foreground/10"
        />
        <div className="min-w-0">
          <p className="font-display text-xl font-bold tracking-tight">Palmeiras</p>
          <p className="text-muted-foreground text-sm">Trajetória na pirâmide</p>
        </div>
      </div>

      <ul className="flex list-none flex-wrap items-center gap-2">
        <li>
          <Chip rotulo="Promédio" valor="2.041" dourado />
        </li>
        <li>
          <Chip rotulo="Temporadas" valor="5" />
        </li>
        <li>
          <Chip rotulo="Títulos" valor="2" dourado Icone={Trophy} />
        </li>
        <li>
          <Chip rotulo="Acessos" valor="3" tom="primary" Icone={ArrowUp} />
        </li>
      </ul>
    </div>
  )
}

/** Espelha o `HeroChip` do `CompetidorHero` (mesmos tokens de cor). */
function Chip({
  rotulo,
  valor,
  dourado = false,
  tom,
  Icone,
}: {
  rotulo: string
  valor: string
  dourado?: boolean
  tom?: "primary" | "destructive"
  Icone?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}) {
  const cor = dourado
    ? "border-gold/30 bg-gold/12 text-gold-ink"
    : tom === "primary"
      ? "border-primary/30 bg-primary/10 text-primary"
      : tom === "destructive"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/40 text-foreground"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${cor}`}
    >
      {Icone ? <Icone className="size-3.5" aria-hidden={true} /> : null}
      <span className="font-display text-sm font-bold tabular-nums">{valor}</span>
      <span className="text-xs font-medium">{rotulo}</span>
    </span>
  )
}
