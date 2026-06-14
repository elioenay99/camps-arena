import { TrendingUp } from "lucide-react"

import type { TemporadaHistorico } from "@/features/league/data/getCompetitorProfile"

/** Promédio alto pinta a barra de dourado (mesma régua do herói). */
const PPG_DESTAQUE = 2.0
/** Altura mínima da barra (%) para uma temporada com ppg > 0 ainda aparecer. */
const ALTURA_MINIMA = 8

/**
 * Mini gráfico de barras (CSS puro, sem lib) do PPG (pontos por jogo) por
 * temporada. As alturas são normalizadas pelo maior ppg do histórico; barras
 * altas (ppg >= 2) ganham tom dourado. Reduced-motion safe: o crescimento é só
 * `transition` sob `motion-safe`. RSC puro. Não renderiza nada com histórico
 * vazio (a página trata o estado vazio).
 */
export function PromedioEvolucao({
  historico,
}: {
  historico: TemporadaHistorico[]
}) {
  if (historico.length === 0) return null

  const maxPpg = Math.max(...historico.map((t) => t.ppg), 0.001)

  return (
    <section aria-labelledby="evolucao-titulo" className="flex flex-col gap-3">
      <h2
        id="evolucao-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <TrendingUp className="size-5 text-primary" aria-hidden="true" />
        Evolução do PPG
      </h2>

      <div className="elevate rounded-xl border bg-card/40 p-4">
        {/* Lista acessível: cada item é uma temporada (nº + ppg). O gráfico é a
            tradução visual; o texto sob cada barra carrega o dado. */}
        <ul className="flex list-none items-end gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {historico.map((t) => {
            const alto = t.ppg >= PPG_DESTAQUE
            const pct =
              t.ppg > 0
                ? Math.max(ALTURA_MINIMA, Math.round((t.ppg / maxPpg) * 100))
                : 0
            return (
              <li
                key={t.numero}
                className="flex min-w-9 flex-1 flex-col items-center gap-1.5"
              >
                {/* Trilho de altura fixa; a barra ocupa pct% de baixo p/ cima. */}
                <div
                  className="flex h-28 w-full items-end"
                  aria-hidden="true"
                >
                  <div
                    className={`w-full rounded-t-md motion-safe:transition-[height] motion-safe:duration-500 ${
                      alto
                        ? "bg-gold/70 ring-1 ring-gold/30"
                        : "bg-primary/60 ring-1 ring-primary/25"
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span
                  aria-hidden="true"
                  className={`font-display text-xs font-bold tabular-nums ${
                    alto ? "text-gold-ink" : "text-foreground"
                  }`}
                >
                  {t.ppg.toFixed(3)}
                </span>
                <span
                  aria-hidden="true"
                  className="text-muted-foreground text-[0.7rem] tabular-nums"
                >
                  T{t.numero}
                </span>
                <span className="sr-only">
                  {`Temporada ${t.numero}: ${t.ppg.toFixed(3)} pontos por jogo`}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
