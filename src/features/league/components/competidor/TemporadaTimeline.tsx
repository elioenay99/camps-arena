import { Trophy } from "lucide-react"

import type { TemporadaHistorico } from "@/features/league/data/getCompetitorProfile"

import { DestinoPill } from "./DestinoPill"

/**
 * Linha do tempo de temporadas: a mais RECENTE primeiro (o histórico chega
 * ordenado asc, então invertemos). Cada item traz temporada nº, divisão
 * (nome + nível, com badge dourado quando campeão), posição final em
 * `font-display`, a pílula de destino e P/J · PPG. Campeão (posição 1) recebe o
 * tratamento dourado da StandingsTable (faixa gold + troféu). RSC puro.
 */
export function TemporadaTimeline({
  historico,
}: {
  historico: TemporadaHistorico[]
}) {
  if (historico.length === 0) return null

  // Mais recente em destaque (topo). O fetcher entrega asc por número.
  const ordenado = [...historico].reverse()

  return (
    <section aria-labelledby="timeline-titulo" className="flex flex-col gap-3">
      <h2
        id="timeline-titulo"
        className="font-display text-lg font-bold tracking-tight"
      >
        Linha do tempo
      </h2>
      <ol className="flex list-none flex-col gap-3">
        {ordenado.map((t, i) => {
          const ehCampeao = t.posicaoFinal === 1
          return (
            <li
              key={t.numero}
              className="animate-rise"
              style={{ "--stagger": `${i * 50}ms` } as React.CSSProperties}
            >
              <article
                className={`elevate relative flex flex-col gap-3 rounded-xl border px-4 py-3.5 ${
                  ehCampeao
                    ? "border-gold/30 bg-gold/8 before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl before:bg-gold/70"
                    : "bg-card/40"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Posição final: o número-âncora da temporada. Campeão = ouro
                        + troféu (espelha a StandingsTable). */}
                    <span
                      className={`font-display flex shrink-0 items-baseline gap-1 text-2xl font-bold tabular-nums ${
                        ehCampeao ? "text-gold-ink" : ""
                      }`}
                    >
                      {ehCampeao ? (
                        <Trophy
                          className="size-5 self-center text-gold-ink"
                          aria-hidden="true"
                        />
                      ) : null}
                      {t.posicaoFinal}
                      <span className="text-base font-semibold">º</span>
                      <span className="sr-only">
                        {`${t.posicaoFinal}º lugar`}
                      </span>
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">
                        {t.divisaoNome.trim() || `Divisão ${t.nivel}`}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Temporada {t.numero}
                        <span aria-hidden="true"> · </span>
                        <span className="sr-only">, </span>
                        Nível {t.nivel}
                        {t.nivel === 1 ? " (elite)" : ""}
                      </span>
                    </div>
                  </div>
                  <DestinoPill destino={t.destino} />
                </div>

                <dl className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <dt className="font-semibold">Pontos</dt>
                    <dd className="text-foreground tabular-nums">{t.pontos}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="font-semibold">Jogos</dt>
                    <dd className="text-foreground tabular-nums">{t.jogos}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="font-semibold">PPG</dt>
                    <dd className="text-foreground tabular-nums">
                      {t.ppg.toFixed(3)}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
