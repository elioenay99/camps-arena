import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MatchStatusButton } from "@/features/match/components/MatchStatusButton"
import type { PartidaAberta } from "@/features/standings/data/getTournamentClassificacao"
import type { MatchStatus } from "@/lib/supabase/database.types"
import { linkWhatsApp, mensagemConvocacao } from "@/lib/whatsapp"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/**
 * Partidas em aberto do torneio — RSC puro. `mostrarEncerrar` liga o console
 * do dono (autorização real no servidor/RLS; o botão é só UX). `convocacao`
 * habilita o atalho "Chamar {adversário}" (re-engajamento): renderizado SÓ
 * nas partidas em que `userId` joga, apontando ao adversário com celular
 * válido — como a lista é RSC, o celular só entra no HTML (href) de quem tem
 * o direito de vê-lo.
 */
export function OpenMatchesList({
  partidas,
  mostrarEncerrar = false,
  convocacao,
}: {
  partidas: PartidaAberta[]
  mostrarEncerrar?: boolean
  convocacao?: { userId: string; titulo: string; tournamentId: string }
}) {
  const atalhoDe = (p: PartidaAberta) => {
    if (!convocacao) return null
    const adversario =
      p.participante_1?.id === convocacao.userId
        ? { lado: p.participante_2, nome: p.nome_2 }
        : p.participante_2?.id === convocacao.userId
          ? { lado: p.participante_1, nome: p.nome_1 }
          : null
    if (!adversario?.lado) return null
    const link = linkWhatsApp(
      adversario.lado.celular,
      mensagemConvocacao({
        adversario: adversario.nome,
        titulo: convocacao.titulo,
        tournamentId: convocacao.tournamentId,
      })
    )
    return link ? { link, nome: adversario.nome } : null
  }

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
            {(() => {
              const atalho = atalhoDe(p)
              return atalho ? (
                <Button
                  asChild
                  size="sm"
                  className="rounded-full bg-green-700 text-white hover:bg-green-800"
                >
                  <a href={atalho.link} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" />
                    Chamar
                    <span className="sr-only">{` ${atalho.nome} no WhatsApp (abre em nova aba)`}</span>
                  </a>
                </Button>
              ) : null
            })()}
            {mostrarEncerrar ? (
              <MatchStatusButton matchId={p.id} acao="encerrar" />
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
