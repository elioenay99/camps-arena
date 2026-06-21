"use client"

import { Flag, Play } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { encerrarEdicaoCopa, iniciarEdicaoCopa } from "@/actions/cups"
import { Button } from "@/components/ui/button"

/** Botão "Iniciar" — gera a chave/grupos e promove a edição para ativa. */
export function IniciarEdicaoButton({ cupSeasonId }: { cupSeasonId: string }) {
  const router = useRouter()
  const [pendente, startTransition] = React.useTransition()

  function iniciar() {
    startTransition(async () => {
      const r = await iniciarEdicaoCopa(cupSeasonId)
      if (r.ok) {
        toast.success("Edição iniciada! A chave está no ar.")
        router.refresh()
        return
      }
      toast.error(r.error)
    })
  }

  return (
    <Button onClick={iniciar} disabled={pendente} size="lg" className="rounded-full">
      <Play aria-hidden="true" />
      {pendente ? "Iniciando…" : "Iniciar edição"}
    </Button>
  )
}

/**
 * Botão "Encerrar edição" — confirmação em dois cliques (espelha o lifecycle do
 * torneio). Exige o torneio concluído; a action grava a classificação final e
 * transiciona para encerrada (alimenta copas que usam esta como origem).
 */
export function EncerrarEdicaoButton({ cupSeasonId }: { cupSeasonId: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = React.useState(false)
  const [pendente, startTransition] = React.useTransition()

  if (!confirmando) {
    return (
      <Button
        onClick={() => setConfirmando(true)}
        variant="outline"
        size="sm"
        className="min-h-10 rounded-full px-4"
      >
        <Flag aria-hidden="true" />
        Encerrar edição
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
      <p className="text-sm" role="alert">
        Encerrar grava a classificação final e libera a edição como origem de outras
        copas. Conclua todos os jogos antes.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await encerrarEdicaoCopa(cupSeasonId)
              if (r.ok) {
                toast.success("Edição encerrada.")
                router.refresh()
              } else {
                toast.error(r.error)
              }
              setConfirmando(false)
            })
          }
        >
          {pendente ? "Encerrando…" : "Confirmar"}
        </Button>
        <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={pendente}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
