"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { adiarPartida, desfazerAdiamento } from "@/actions/postponement"
import { Button } from "@/components/ui/button"

/**
 * Folhas client mínimas do adiamento (padrão de `WoButtons.tsx`): action +
 * toast; a autorização real é action + RLS — os botões são só UX.
 */

/** Mesmo alvo de toque mínimo (44px) de `WoButtons.tsx`. */
const ALVO_TOQUE = "min-h-11 px-4"

/**
 * Adiar partida (liga/fase de grupos — NUNCA chave, o call-site só monta este
 * botão fora de chave). Estado local só para o passo de motivo (sem
 * AlertDialog, mesmo padrão do W.O.): fechado → "Adiar"; aberto → campo de
 * motivo (opcional) + Confirmar/Cancelar.
 */
export function AdiarButton({ matchId }: { matchId: string }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [pendente, startTransition] = useTransition()

  function confirmar() {
    startTransition(async () => {
      const r = await adiarPartida(matchId, motivo.trim() || undefined)
      if (r.ok) {
        toast.success("Partida adiada.")
        setAberto(false)
        setMotivo("")
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
        Adiar
      </Button>
    )
  }

  return (
    <span className="bg-muted/40 flex flex-wrap items-center gap-2 gap-y-2 rounded-md px-3 py-2 sm:gap-x-6">
      <label className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        <span className="sr-only">Motivo do adiamento (opcional)</span>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)"
          maxLength={280}
          disabled={pendente}
          className="border-input bg-background min-w-0 flex-1 rounded border px-2 py-1 text-xs"
        />
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={confirmar}
      >
        Confirmar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={ALVO_TOQUE}
        disabled={pendente}
        onClick={() => {
          setAberto(false)
          setMotivo("")
        }}
      >
        Cancelar
      </Button>
    </span>
  )
}

/** Desfaz o adiamento (quem arbitra): volta a partida ao estado aberto normal. */
export function DesfazerAdiamentoButton({ matchId }: { matchId: string }) {
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
          const r = await desfazerAdiamento(matchId)
          if (r.ok) {
            toast.success("Adiamento desfeito.")
          } else {
            toast.error(r.error)
          }
        })
      }
    >
      {pendente ? "Desfazendo…" : "Desfazer adiamento"}
    </Button>
  )
}
