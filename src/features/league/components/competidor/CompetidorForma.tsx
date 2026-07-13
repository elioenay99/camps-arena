import { Activity, Flame, Trophy, Shield, ShieldCheck, Gauge } from "lucide-react"

import { FormaBadges } from "@/features/standings/components/FormaBadges"
import type { CompetidorInsights } from "@/features/league/data/getCompetidorInsights"

/**
 * Forma recente + destaques de CARREIRA do competidor (change
 * add-insights-classificacao). RSC puro. Sem ataque/defesa relativos (só um
 * competidor). Renderiza nada quando ele ainda não tem jogos.
 */
export function CompetidorForma({
  insights,
}: {
  insights: CompetidorInsights
}) {
  const { forma, destaques } = insights
  if (destaques.jogos === 0) return null

  const cards: { Icon: typeof Flame; titulo: string; valor: string }[] = [
    {
      Icon: Trophy,
      titulo: "Aproveitamento",
      valor: `${destaques.vitorias}V ${destaques.empates}E ${destaques.derrotas}D`,
    },
  ]
  if (destaques.maiorGoleada) {
    cards.push({
      Icon: Flame,
      titulo: "Maior goleada",
      valor: `${destaques.maiorGoleada.placarVencedor} x ${destaques.maiorGoleada.placarPerdedor}`,
    })
  }
  if (destaques.maiorSequenciaVitorias > 0) {
    cards.push({
      Icon: Trophy,
      titulo: "Sequência de vitórias",
      valor: `${destaques.maiorSequenciaVitorias} jogos`,
    })
  }
  if (destaques.maiorInvencibilidade > 0) {
    cards.push({
      Icon: Flame,
      titulo: "Invencibilidade",
      valor: `${destaques.maiorInvencibilidade} jogos`,
    })
  }
  if (destaques.totalCleanSheets > 0) {
    cards.push({
      Icon: Shield,
      titulo: "Total sem sofrer gol",
      valor: `${destaques.totalCleanSheets} jogos`,
    })
  }
  if (destaques.maiorSequenciaCleanSheets > 0) {
    cards.push({
      Icon: ShieldCheck,
      titulo: "Sequência sem sofrer gol",
      valor: `${destaques.maiorSequenciaCleanSheets} jogos`,
    })
  }
  if (destaques.mediaGolsPorJogo > 0) {
    cards.push({
      Icon: Gauge,
      titulo: "Média de gols",
      valor: destaques.mediaGolsPorJogo.toFixed(2),
    })
  }

  return (
    <section aria-labelledby="forma-competidor-titulo" className="flex flex-col gap-3">
      <h2
        id="forma-competidor-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Activity className="size-5 text-gold-ink" aria-hidden="true" />
        Forma e destaques
      </h2>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Últimos jogos</span>
        <FormaBadges itens={forma} />
      </div>

      <ul className="grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3">
        {cards.map((c) => (
          <li
            key={c.titulo}
            className="elevate flex flex-col gap-0.5 rounded-xl border bg-muted/20 px-3 py-3"
          >
            <span className="text-muted-foreground flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide uppercase">
              <c.Icon className="size-3.5" aria-hidden="true" />
              {c.titulo}
            </span>
            <span className="font-display text-lg font-bold tabular-nums">
              {c.valor}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
