import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import type { LinhaMuralha } from "@/features/league/data/getMuralha"
import { TeamCrest } from "@/features/team/components/TeamCrest"

/**
 * Ranking de defesas ("Muralha") de uma competição (torneio ou pirâmide) —
 * espelho defensivo do `ArtilhariaRanking`. Uma linha por competidor: posição,
 * escudo + nome (link para a página do competidor), gols sofridos em N jogos e o
 * total de clean sheets em destaque. RSC puro — só renderiza os dados já
 * agregados/ordenados por `getMuralha` (clean sheets desc). Vazia → estado limpo.
 */
export function MuralhaRanking({ linhas }: { linhas: LinhaMuralha[] }) {
  if (linhas.length === 0) {
    return (
      <div className="bg-muted/10 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
        <span
          aria-hidden="true"
          className="bg-primary/8 text-primary/70 flex size-11 items-center justify-center rounded-full"
        >
          <ShieldCheck className="size-5" />
        </span>
        <p className="text-muted-foreground max-w-xs text-sm">
          Nenhuma defesa registrada ainda. A Muralha aparece conforme as partidas
          encerram — cada jogo sem sofrer gol conta um clean sheet.
        </p>
      </div>
    )
  }

  return (
    <ol className="flex list-none flex-col gap-2 p-0">
      {linhas.map((linha, i) => (
        <li
          key={linha.competitorId}
          className="flex items-center gap-3 rounded-lg border bg-card/40 px-3 py-2.5 text-sm"
        >
          <span
            className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <TeamCrest
            nome={linha.competitorNome}
            escudoUrl={linha.escudoUrl}
            size={28}
          />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            {/* Sem prefetch: a lista pode ter dezenas de links p/ rota RSC cara
                (perfil do competidor) — a rajada estourava a borda da Vercel
                (503). Ver add-liga-prefetch-fix. */}
            <Link
              href={`/dashboard/ligas/competidor/${linha.competitorId}`}
              prefetch={false}
              className="truncate font-medium underline-offset-4 hover:underline focus-visible:underline"
            >
              {linha.competitorNome}
            </Link>
            <span className="text-muted-foreground truncate text-xs">
              {linha.golsSofridos}{" "}
              {linha.golsSofridos === 1 ? "gol sofrido" : "gols sofridos"} em{" "}
              {linha.jogos} {linha.jogos === 1 ? "jogo" : "jogos"}
            </span>
          </span>
          <span className="font-display flex shrink-0 items-baseline gap-1 text-base font-bold tabular-nums">
            {linha.cleanSheets}
            <span className="text-muted-foreground text-xs font-medium">
              {linha.cleanSheets === 1 ? "clean sheet" : "clean sheets"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
