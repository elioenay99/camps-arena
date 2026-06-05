import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import type { PartidaEncerrada } from "@/features/standings/data/getTournamentClassificacao"

// Timezone fixo do produto (app pt-BR): sem ele o servidor formataria em UTC
// e a data viraria "amanhã" à noite. Por-usuário só quando houver perfil.
const formatoData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Histórico de partidas encerradas — RSC puro, só renderiza o fetcher.
 * `mostrarReabrir` liga o console do dono (a autorização REAL fica no
 * servidor/RLS; o botão é só UX).
 */
export function MatchHistoryList({
  partidas,
  mostrarReabrir = false,
}: {
  partidas: PartidaEncerrada[]
  mostrarReabrir?: boolean
}) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {partidas.map((p) => (
        <li
          key={p.id}
          className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        >
          {/* min-w-0 + truncate: sem eles, nome longo não encolhe (min-width
              auto do flex) e o grupo invade a data no mobile. */}
          <span className="flex min-w-0 items-center gap-2" aria-hidden="true">
            <span className="truncate">{p.nome_1}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {p.placar_1} x {p.placar_2}
            </span>
            <span className="truncate">{p.nome_2}</span>
          </span>
          <span className="sr-only">
            {`Placar final: ${p.nome_1} ${p.placar_1}, ${p.nome_2} ${p.placar_2}`}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <time dateTime={p.encerradaEm} className="text-muted-foreground text-xs">
              {formatoData.format(new Date(p.encerradaEm))}
            </time>
            {mostrarReabrir ? (
              <MatchStatusButton matchId={p.id} acao="reabrir" />
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
