import { Layers, Users } from "lucide-react"

import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type { TecnicoPerfil } from "@/features/league/data/getTecnicoProfile"

/**
 * Herói do perfil do TÉCNICO (change add-tecnicos-historico): avatar + nome
 * (`font-display`) e chips de destaque (clubes comandados, temporadas). RSC puro.
 */
export function TecnicoHero({ perfil }: { perfil: TecnicoPerfil }) {
  return (
    <header className="elevate flex flex-col gap-5 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:gap-5">
      <UserAvatar
        nome={perfil.nome}
        avatarUrl={perfil.avatar}
        size={72}
        className="size-16 self-start ring-1 ring-foreground/10 sm:size-[72px]"
      />

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Técnico
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">
            {perfil.nome}
          </h1>
        </div>

        <ul className="flex list-none flex-wrap items-center gap-2">
          <li>
            <Chip
              rotulo={perfil.totalClubes === 1 ? "Clube" : "Clubes"}
              valor={String(perfil.totalClubes)}
              Icone={Users}
            />
          </li>
          {perfil.totalTemporadas > 0 ? (
            <li>
              <Chip
                rotulo={perfil.totalTemporadas === 1 ? "Temporada" : "Temporadas"}
                valor={String(perfil.totalTemporadas)}
                Icone={Layers}
              />
            </li>
          ) : null}
        </ul>
      </div>
    </header>
  )
}

function Chip({
  rotulo,
  valor,
  Icone,
}: {
  rotulo: string
  valor: string
  Icone?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}) {
  return (
    <span className="border-border bg-muted/40 text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
      {Icone ? <Icone className="size-3.5" aria-hidden={true} /> : null}
      <span className="font-display text-sm font-bold tabular-nums">{valor}</span>
      <span className="text-xs font-medium">{rotulo}</span>
    </span>
  )
}
