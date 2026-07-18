import { Goal, ListChecks, Timer, Trophy } from "lucide-react"

import type { PartidaCronologica } from "@/features/standings/insights"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"
import type { ArtilhariaLinha } from "@/features/league/data/getArtilharia"

function Indicador({
  icon,
  rotulo,
  valor,
}: {
  icon: React.ReactNode
  rotulo: string
  valor: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5">
      <span aria-hidden className="text-primary/70">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-display text-lg leading-none tabular-nums">
          {valor}
        </span>
        <span className="truncate text-xs text-muted-foreground">{rotulo}</span>
      </span>
    </div>
  )
}

/**
 * Painel de indicadores/dashboard do torneio — métricas agregadas derivadas do
 * estado local (recomputam após EDITAR_PLACAR).
 */
export function IndicadoresTorneio({
  linhas,
  artilharia,
  partidas,
}: {
  linhas: LinhaComNome[]
  artilharia: ArtilhariaLinha[]
  partidas: PartidaCronologica[]
}) {
  const totalGols = linhas.reduce((acc, l) => acc + l.golsPro, 0)
  const encerradas = partidas.filter((p) => p.status === "encerrada").length
  const emAndamento = partidas.filter((p) => p.status === "em_andamento").length
  const lider = linhas[0]?.nome ?? "—"
  const artilheiro = artilharia[0]
    ? `${artilharia[0].jogador} (${artilharia[0].gols})`
    : "—"

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Indicador icon={<Trophy className="size-5" />} rotulo="Líder" valor={lider} />
      <Indicador icon={<Goal className="size-5" />} rotulo="Gols no torneio" valor={String(totalGols)} />
      <Indicador icon={<ListChecks className="size-5" />} rotulo="Partidas encerradas" valor={String(encerradas)} />
      <Indicador icon={<Timer className="size-5" />} rotulo="Em andamento" valor={String(emAndamento)} />
      <Indicador icon={<Goal className="size-5" />} rotulo="Artilheiro" valor={artilheiro} />
    </div>
  )
}
