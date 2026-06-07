import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import type { PartidaEncerrada } from "@/features/standings/data/getTournamentClassificacao"
import { cn } from "@/lib/utils"

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
            {/* Rodada/fase gerada; partida avulsa (rodada null) fica como
                sempre. Perna identifica ida/volta do confronto de mata-mata. */}
            {p.rodada !== null ? (
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {p.grupo !== null ? `G${p.grupo} ` : ""}
                R{p.rodada}
                {p.perna !== null ? (p.perna === 1 ? " ida" : " volta") : ""}
              </span>
            ) : null}
            <span className={cn("truncate", p.wo && p.woVencedorLado === 1 && "font-semibold")}>
              {p.nome_1}
            </span>
            {p.wo ? (
              <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 text-xs font-medium uppercase">
                W.O.
              </span>
            ) : (
              <span className="shrink-0 font-semibold tabular-nums">
                {p.placar_1} x {p.placar_2}
              </span>
            )}
            <span className={cn("truncate", p.wo && p.woVencedorLado === 2 && "font-semibold")}>
              {p.nome_2}
            </span>
          </span>
          <span className="sr-only">
            {p.wo
              ? `${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}: ` : ""}W.O. — ${p.woVencedorLado === 1 ? p.nome_1 : p.nome_2} venceu`
              : `${p.rodada !== null ? `${p.grupo !== null ? `Grupo ${p.grupo}, ` : ""}Rodada ${p.rodada}${p.perna !== null ? ` (${p.perna === 1 ? "ida" : "volta"})` : ""}: ` : ""}Placar final: ${p.nome_1} ${p.placar_1}, ${p.nome_2} ${p.placar_2}`}
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
