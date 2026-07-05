"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { fecharRodada, marcarWO, marcarWoDuplo, responderWO, solicitarWO } from "@/actions/wo"
import { Button } from "@/components/ui/button"

/**
 * Folhas client mínimas do W.O. (padrão MatchStatusButton): action + toast; o
 * revalidatePath das actions atualiza a página. A autorização real é
 * action + RLS — os botões são UX.
 */

/**
 * Alvo de toque mínimo (44px) para ações IRREVERSÍVEIS em mobile. A base
 * `size="sm"` tem h-7 (28px); aqui elevamos altura + padding sem inflar os
 * botões pequenos legítimos do resto do app (a base do Button fica intacta).
 */
const ALVO_TOQUE = "min-h-11 px-4"

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
  permiteDuplo = false,
}: {
  matchId: string
  nome1: string
  nome2: string
  vagaId1: string
  vagaId2: string
  /** Fora de chave (`posicao == null`): habilita a opção "Ambos ausentes"
   * (duplo W.O.). Em chave fica oculta — a chave sempre exige um vencedor. */
  permiteDuplo?: boolean
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

  function marcarDuplo() {
    startTransition(async () => {
      const r = await marcarWoDuplo(matchId)
      if (r.ok) {
        toast.success("Duplo W.O. registrado — ambos ausentes.")
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
        className={ALVO_TOQUE}
        onClick={() => setAberto(true)}
      >
        W.O.
      </Button>
    )
  }

  return (
    <span className="bg-muted/40 flex flex-wrap items-center gap-2 gap-y-2 rounded-md px-3 py-2 sm:gap-x-6">
      <span className="text-muted-foreground text-xs">
        {permiteDuplo ? "Resultado do W.O.:" : "Vitória de:"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() => marcar(vagaId1)}
      >
        {nome1}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() => marcar(vagaId2)}
      >
        {nome2}
      </Button>
      {permiteDuplo ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={ALVO_TOQUE}
          disabled={pendente}
          onClick={marcarDuplo}
        >
          Ambos ausentes
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() => setAberto(false)}
      >
        Cancelar
      </Button>
    </span>
  )
}

/**
 * Solicitar W.O. (TÉCNICO adversário): pede o W.O.; o dono resolve. A foto de
 * evidência é OPCIONAL — guardada em estado e passada à action, que a sobe (com
 * rollback). Após solicitar, o estado da foto é limpo.
 */
export function SolicitarWoButton({ matchId }: { matchId: string }) {
  const [pendente, startTransition] = useTransition()
  const [foto, setFoto] = useState<File | null>(null)

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="max-w-[10rem] text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:text-foreground"
          disabled={pendente}
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
        />
        <span className="sr-only">Anexar foto (opcional)</span>
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            const r = await solicitarWO(matchId, foto)
            if (r.ok) {
              toast.success("W.O. solicitado. Aguarde o organizador.")
              setFoto(null)
            } else {
              toast.error(r.error)
            }
          })
        }
      >
        {pendente ? "Solicitando…" : "Solicitar W.O."}
      </Button>
    </span>
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
      className={ALVO_TOQUE}
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
    <span className="flex flex-wrap items-center gap-6">
      <Button
        type="button"
        size="sm"
        variant="default"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() => responder(true)}
      >
        Aceitar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() => responder(false)}
      >
        Recusar
      </Button>
    </span>
  )
}
