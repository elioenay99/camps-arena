import Link from "next/link"
import { ArrowDown, ArrowUp, Layers, Trophy } from "lucide-react"

import type { CompetidorPerfil } from "@/features/league/data/getCompetitorProfile"

import { CompetidorIdentidade } from "./CompetidorIdentidade"

/** Promédio alto ganha tratamento dourado (mesma régua da elite). */
const PROMEDIO_DESTAQUE = 2.0

/**
 * Herói do perfil do competidor: escudo/avatar grande + nome (`font-display`) +
 * link de volta para a pirâmide, e uma faixa de chips de destaque (promédio,
 * temporadas, títulos, acessos/quedas). RSC puro.
 */
export function CompetidorHero({ perfil }: { perfil: CompetidorPerfil }) {
  const promedioAlto = perfil.promedio >= PROMEDIO_DESTAQUE && perfil.totalJogos > 0

  return (
    <header className="elevate flex flex-col gap-5 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:gap-5">
      <CompetidorIdentidade
        nome={perfil.nome}
        escudoUrl={perfil.escudoUrl}
        porNome={perfil.porNome}
        size={72}
        className="size-16 self-start ring-1 ring-foreground/10 sm:size-[72px]"
      />

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">
            {perfil.nome}
          </h1>
          <Link
            href={
              perfil.seasonAtualId
                ? `/dashboard/ligas/${perfil.seasonAtualId}`
                : "/dashboard/ligas"
            }
            className="text-muted-foreground inline-flex w-fit items-center gap-1.5 rounded text-sm underline-offset-2 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Layers className="size-3.5" aria-hidden="true" />
            {perfil.competitionNome.trim() || "Pirâmide"}
          </Link>
        </div>

        {/* Chips de destaque. O promédio é o número-chave (3 casas); títulos só
            aparecem quando > 0 (com troféu); acessos/quedas idem. */}
        <ul className="flex list-none flex-wrap items-center gap-2">
          <li>
            <HeroChip
              rotulo="Promédio"
              valor={perfil.totalJogos > 0 ? perfil.promedio.toFixed(3) : "—"}
              dourado={promedioAlto}
            />
          </li>
          <li>
            <HeroChip
              rotulo={
                perfil.temporadasDisputadas === 1 ? "Temporada" : "Temporadas"
              }
              valor={String(perfil.temporadasDisputadas)}
            />
          </li>
          {perfil.titulos > 0 ? (
            <li>
              <HeroChip
                rotulo={perfil.titulos === 1 ? "Título" : "Títulos"}
                valor={String(perfil.titulos)}
                dourado
                Icone={Trophy}
              />
            </li>
          ) : null}
          {perfil.acessos > 0 ? (
            <li>
              <HeroChip
                rotulo={perfil.acessos === 1 ? "Acesso" : "Acessos"}
                valor={String(perfil.acessos)}
                tom="primary"
                Icone={ArrowUp}
              />
            </li>
          ) : null}
          {perfil.quedas > 0 ? (
            <li>
              <HeroChip
                rotulo={perfil.quedas === 1 ? "Queda" : "Quedas"}
                valor={String(perfil.quedas)}
                tom="destructive"
                Icone={ArrowDown}
              />
            </li>
          ) : null}
        </ul>
      </div>
    </header>
  )
}

function HeroChip({
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
  // gold-ink = TEXTO/ícone dourado legível nos dois temas (regra do projeto:
  // nunca usar `gold` como cor de texto). Faixas/anel usam gold/primary/destructive.
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
