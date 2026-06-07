import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import type { PartidaAberta } from "@/features/standings/data/getTournamentClassificacao"
import type { MatchStatus } from "@/lib/supabase/database.types"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/**
 * Partidas em aberto do torneio — RSC puro. `mostrarEncerrar` liga o console
 * do dono (autorização real no servidor/RLS; o botão é só UX).
 */
export function OpenMatchesList({
  partidas,
  mostrarEncerrar = false,
}: {
  partidas: PartidaAberta[]
  mostrarEncerrar?: boolean
}) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {partidas.map((p) => (
        <li
          key={p.id}
          className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2" aria-hidden="true">
            {/* Rodada/fase gerada; partida avulsa (rodada null) fica como
                sempre. Perna identifica ida/volta do confronto de mata-mata. */}
            {p.rodada !== null ? (
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {p.grupo !== null ? `G${p.grupo} ` : ""}
                R{p.rodada}
                {p.perna !== null ? (p.perna === 1 ? " ida" : " volta") : ""}
              </span>
            ) : null}
            <span className="truncate">{p.nome_1}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {p.placar_1} x {p.placar_2}
            </span>
            <span className="truncate">{p.nome_2}</span>
          </span>
          <span className="sr-only">
            {`${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}${p.perna !== null ? ` (${p.perna === 1 ? "ida" : "volta"})` : ""}: ` : ""}Placar atual: ${p.nome_1} ${p.placar_1}, ${p.nome_2} ${p.placar_2} — partida ${LABEL_STATUS[p.status]}`}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span aria-hidden="true" className="text-muted-foreground text-xs">
              {LABEL_STATUS[p.status]}
            </span>
            {mostrarEncerrar ? (
              <MatchStatusButton matchId={p.id} acao="encerrar" />
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
