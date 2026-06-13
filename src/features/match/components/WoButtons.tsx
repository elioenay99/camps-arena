"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { fecharRodada, marcarWO, responderWO, solicitarWO } from "@/actions/wo"
import { Button } from "@/components/ui/button"

/**
 * Folhas client mínimas do W.O. (padrão MatchStatusButton): action + toast; o
 * revalidatePath das actions atualiza a página. A autorização real é
 * action + RLS — os botões são UX.
 */

/**
 * Marcar W.O. (DONO): o vencedor é apontado entre os dois clubes. Estado local
 * só para o passo de escolha (sem AlertDialog): fechado → "W.O."; aberto →
 * dois botões (vitória de cada lado) + cancelar.
 */
export function MarcarWoButton({
  matchId,
  nome1,
  nome2,
  vagaId1,
  vagaId2,
}: {
  matchId: string
  nome1: string
  nome2: string
  vagaId1: string
  vagaId2: string
}) {
  const [aberto, setAberto] = useState(false)
  const [pendente, startTransition] = useTransition()

  function marcar(vencedorSlotId: string) {
    startTransition(async () => {
      const r = await marcarWO(matchId, vencedorSlotId)
      if (r.ok) {
        toast.success("W.O. registrado.")
        setAberto(false)
      } else {
        toast.error(r.error)
      }
    })
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setAberto(true)}
      >
        W.O.
      </Button>
    )
  }

  return (
    <span className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md px-2 py-1">
      <span className="text-muted-foreground text-xs">Vitória de:</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() => marcar(vagaId1)}
      >
        {nome1}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() => marcar(vagaId2)}
      >
        {nome2}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pendente}
        onClick={() => setAberto(false)}
      >
        Cancelar
      </Button>
    </span>
  )
}

/** Solicitar W.O. (TÉCNICO adversário): pede o W.O.; o dono resolve. */
export function SolicitarWoButton({ matchId }: { matchId: string }) {
  const [pendente, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await solicitarWO(matchId)
          if (r.ok) toast.success("W.O. solicitado. Aguarde o organizador.")
          else toast.error(r.error)
        })
      }
    >
      {pendente ? "Solicitando…" : "Solicitar W.O."}
    </Button>
  )
}

/** Fechar rodada (DONO): resolve as partidas órfãs da rodada por W.O. */
export function FecharRodadaButton({
  tournamentId,
  rodada,
}: {
  tournamentId: string
  rodada: number
}) {
  const [pendente, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await fecharRodada(tournamentId, rodada)
          if (r.ok) {
            toast.success(
              r.marcadas > 0
                ? `Rodada fechada — ${r.marcadas} ${r.marcadas === 1 ? "W.O. registrado" : "W.O. registrados"}.`
                : "Rodada fechada — nenhuma partida órfã para resolver."
            )
          } else {
            toast.error(r.error)
          }
        })
      }
    >
      {pendente ? "Fechando…" : "Fechar rodada"}
    </Button>
  )
}

/** Resolver solicitação de W.O. (DONO): aceitar (vira W.O.) ou recusar. */
export function ResponderWoButtons({ requestId }: { requestId: string }) {
  const [pendente, startTransition] = useTransition()

  function responder(aceito: boolean) {
    startTransition(async () => {
      const r = await responderWO(requestId, aceito)
      if (r.ok) toast.success(aceito ? "W.O. concedido." : "Solicitação recusada.")
      else toast.error(r.error)
    })
  }

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="default"
        disabled={pendente}
        onClick={() => responder(true)}
      >
        Aceitar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pendente}
        onClick={() => responder(false)}
      >
        Recusar
      </Button>
    </span>
  )
}
