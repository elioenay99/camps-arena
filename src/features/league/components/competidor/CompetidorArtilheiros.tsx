import { Goal } from "lucide-react"

import type { ArtilheiroLinha } from "@/features/league/data/getArtilheirosDoCompetidor"

/**
 * Artilheiros na carreira do competidor: `{jogador, gols}` agregados por nome ao
 * longo de todas as partidas do competidor (já ordenados por gols desc). Casa
 * com a linguagem visual do hall da fama (Conquistas): cards em grade, dourado
 * para o artilheiro principal. RSC puro. Vazio → estado limpo.
 */
export function CompetidorArtilheiros({
  artilheiros,
}: {
  artilheiros: ArtilheiroLinha[]
}) {
  return (
    <section aria-labelledby="artilheiros-competidor-titulo" className="flex flex-col gap-3">
      <h2
        id="artilheiros-competidor-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Goal className="size-5 text-gold-ink" aria-hidden="true" />
        Artilheiros
      </h2>

      {artilheiros.length === 0 ? (
        <div className="bg-muted/10 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-muted-foreground max-w-xs text-sm">
            Nenhum gol registrado ainda. Os artilheiros aparecem quando os autores
            dos gols forem informados no lançamento dos placares.
          </p>
        </div>
      ) : (
        <ol className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {artilheiros.map((a, i) => {
            // O artilheiro principal (mais gols) ganha o destaque dourado.
            const destaque = i === 0
            return (
              <li
                key={a.jogador}
                className={`elevate flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center ${
                  destaque
                    ? "border-gold/30 bg-gold/12 text-gold-ink"
                    : "border-border bg-muted/20"
                }`}
              >
                <span className="font-display text-2xl font-bold tabular-nums">
                  {a.gols}
                </span>
                <span className="text-xs font-medium">
                  {a.gols === 1 ? "gol" : "gols"}
                </span>
                <span className="mt-0.5 max-w-full truncate text-sm font-semibold">
                  {a.jogador}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
