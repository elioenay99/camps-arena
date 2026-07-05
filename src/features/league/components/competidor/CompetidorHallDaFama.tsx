import {
  ArrowDown,
  ArrowUp,
  Crown,
  Flame,
  Goal,
  Medal,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type {
  ConquistaTemporada,
  ConquistaTipo,
  Trofeu,
} from "@/features/league/data/getConquistasDoCompetidor"

type Tom = "gold" | "primary" | "destructive"

const META: Record<ConquistaTipo, { rotulo: string; Icone: LucideIcon; tom: Tom }> = {
  campeao: { rotulo: "Campeão", Icone: Crown, tom: "gold" },
  vice: { rotulo: "Vice", Icone: Medal, tom: "gold" },
  artilheiro: { rotulo: "Artilheiro", Icone: Goal, tom: "gold" },
  promovido: { rotulo: "Promovido", Icone: ArrowUp, tom: "primary" },
  melhor_ataque: { rotulo: "Melhor ataque", Icone: Flame, tom: "primary" },
  melhor_defesa: { rotulo: "Melhor defesa", Icone: Shield, tom: "primary" },
  melhor_sequencia: { rotulo: "Melhor sequência", Icone: Zap, tom: "primary" },
  rebaixado: { rotulo: "Rebaixado", Icone: ArrowDown, tom: "destructive" },
}

const TOM_CLASSE: Record<Tom, string> = {
  gold: "border-gold/30 bg-gold/12 text-gold-ink",
  primary: "border-primary/30 bg-primary/10 text-primary",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
}

/** Detalhe secundário de um troféu (divisão, valor, artilheiro). */
function detalhe(trofeu: Trofeu): string | null {
  if (trofeu.tipo === "artilheiro") {
    const gols = trofeu.valorNum
    const nome = trofeu.jogador ?? "—"
    return gols != null ? `${nome} · ${gols} ${gols === 1 ? "gol" : "gols"}` : nome
  }
  return trofeu.valorTexto
}

/**
 * Hall da fama do competidor: os troféus PERSISTIDOS (`conquistas`) agrupados por
 * temporada, ao lado das contagens agregadas (`CompetidorConquistas`). Cada
 * temporada vira um card com seus troféus (campeão, vice, promovido, rebaixado,
 * artilheiro, melhores). RSC puro. Vazio → a seção some (a página cobre o estado
 * "sem temporadas").
 */
export function CompetidorHallDaFama({
  temporadas,
}: {
  temporadas: ConquistaTemporada[]
}) {
  if (temporadas.length === 0) return null

  return (
    <section aria-labelledby="hall-da-fama-titulo" className="flex flex-col gap-3">
      <h2
        id="hall-da-fama-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Sparkles className="size-5 text-gold-ink" aria-hidden="true" />
        Hall da fama
      </h2>

      <ol className="flex list-none flex-col gap-4 p-0">
        {temporadas.map((temporada) => (
          <li
            key={temporada.refId}
            className="elevate flex flex-col gap-3 rounded-xl border p-4"
          >
            <h3 className="text-sm font-semibold tracking-tight">{temporada.rotulo}</h3>
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {temporada.trofeus.map((trofeu, i) => {
                const meta = META[trofeu.tipo]
                if (!meta) return null
                const { Icone, rotulo, tom } = meta
                const sub = detalhe(trofeu)
                return (
                  <li
                    key={`${trofeu.tipo}-${i}`}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${TOM_CLASSE[tom]}`}
                  >
                    <Icone className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold">{rotulo}</span>
                      {sub ? (
                        <span className="text-xs font-medium opacity-80">{sub}</span>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
