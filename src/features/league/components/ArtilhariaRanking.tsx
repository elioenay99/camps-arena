import Link from "next/link"
import { Goal } from "lucide-react"

import type { ArtilhariaLinha } from "@/features/league/data/getArtilharia"
import { TeamCrest } from "@/features/team/components/TeamCrest"

/**
 * Ranking de artilharia de uma competição (torneio ou pirâmide). Uma linha por
 * `(competidor, autor)`: posição, identidade do competidor (escudo placeholder +
 * nome, com link para a página do competidor), autor e total de gols. RSC puro —
 * só renderiza os dados já agregados/ordenados por `getArtilharia`.
 *
 * `linhas` já vem ordenada por gols desc. Vazia → estado limpo. Sem escudo real
 * no shape: o `TeamCrest` cai no placeholder de iniciais (cor estável por nome).
 */
export function ArtilhariaRanking({ linhas }: { linhas: ArtilhariaLinha[] }) {
  if (linhas.length === 0) {
    return (
      <div className="bg-muted/10 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
        <span
          aria-hidden="true"
          className="bg-primary/8 text-primary/70 flex size-11 items-center justify-center rounded-full"
        >
          <Goal className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">
          Nenhum gol registrado ainda. Os artilheiros aparecem conforme os autores
          dos gols forem informados no lançamento dos placares.
        </p>
      </div>
    )
  }

  return (
    <ol className="flex list-none flex-col gap-2 p-0">
      {linhas.map((linha, i) => (
        <li
          key={`${linha.competitorId}-${linha.jogador}`}
          className="flex items-center gap-3 rounded-lg border bg-card/40 px-3 py-2.5 text-sm"
        >
          <span
            className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <TeamCrest nome={linha.competitorNome} size={28} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-medium">{linha.jogador}</span>
            {/* Sem prefetch: a lista pode ter dezenas de links p/ rota RSC cara
                (perfil do competidor) — a rajada estourava a borda da Vercel
                (503). Ver add-liga-prefetch-fix. */}
            <Link
              href={`/dashboard/ligas/competidor/${linha.competitorId}`}
              prefetch={false}
              className="text-muted-foreground truncate text-xs underline-offset-4 hover:underline focus-visible:underline"
            >
              {linha.competitorNome}
            </Link>
          </span>
          <span className="font-display shrink-0 text-base font-bold tabular-nums">
            {linha.gols}
            <span className="text-muted-foreground ml-1 text-xs font-medium">
              {linha.gols === 1 ? "gol" : "gols"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
