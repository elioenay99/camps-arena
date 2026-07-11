"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { expulsarTecnicoWo, perdoarWoTecnico } from "@/actions/wo"
import { Button } from "@/components/ui/button"

/**
 * Folhas client das ações disciplinares (change add-contador-wo-tecnico). Só
 * aparecem quando o streak atinge o limite (a página gateia por `podeGerir` +
 * streak). Confirmação em DOIS cliques (padrão do repo sem AlertDialog — ver
 * TournamentLifecycleButtons): o 1º clique abre o aviso, o 2º confirma. A
 * autorização real é action + RLS; os botões são UX.
 */

const ALVO_TOQUE = "min-h-11 px-4"

/**
 * Perdoar (zera a contagem, mantém o técnico). O toast NÃO expõe o número de
 * perdões (a materialização varre todas as tenures do técnico e pode exceder o
 * streak visível — o número confundiria): mensagem fixa "Contagem zerada".
 */
export function PerdoarWoButton({
  tournamentId,
  userId,
}: {
  tournamentId: string
  userId: string
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, startTransition] = useTransition()

  if (!confirmando) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ALVO_TOQUE}
        onClick={() => setConfirmando(true)}
      >
        Perdoar
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs" role="alert">
        Zera a contagem de W.O. seguidos. Não altera resultados nem classificação.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          className={ALVO_TOQUE}
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await perdoarWoTecnico(tournamentId, userId)
              if (r.ok) toast.success("Contagem zerada.")
              else toast.error(r.error)
              setConfirmando(false)
            })
          }
        >
          {pendente ? "Perdoando…" : "Confirmar perdão"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={ALVO_TOQUE}
          disabled={pendente}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/**
 * Expulsar (remove o técnico da vaga; o próximo começa do zero). Gesto
 * disciplinar liberado a quem gere (dono + admins) — via a RPC dedicada
 * `expulsar_tecnico_wo`, NÃO a `expulsarTecnico` dono-only.
 */
export function ExpulsarTecnicoButton({
  tournamentId,
  slotId,
}: {
  tournamentId: string
  slotId: string
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, startTransition] = useTransition()

  if (!confirmando) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ALVO_TOQUE}
        onClick={() => setConfirmando(true)}
      >
        Expulsar
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs" role="alert">
        Remove o técnico da vaga. O próximo que entrar começa do zero.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className={ALVO_TOQUE}
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await expulsarTecnicoWo(tournamentId, slotId)
              if (r.ok) {
                toast.success(
                  r.expulsou
                    ? "Técnico removido da vaga."
                    : "A vaga já estava sem técnico."
                )
              } else {
                toast.error(r.error)
              }
              setConfirmando(false)
            })
          }
        >
          {pendente ? "Expulsando…" : "Confirmar expulsão"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={ALVO_TOQUE}
          disabled={pendente}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
