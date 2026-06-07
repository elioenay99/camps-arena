"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { encerrarTorneio, reabrirTorneio } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Console de lifecycle do TORNEIO (dono — gate na página; autorização real é
 * action + RLS). Encerrar é destrutivo na prática (congela tudo): exige
 * confirmação em DOIS cliques com o aviso de partidas abertas — padrão do
 * repo sem AlertDialog (estado local; Cancelar desarma). Reabrir é
 * não-destrutivo e roda direto (useTransition + toast, padrão
 * MatchStatusButton).
 */
export function TournamentLifecycleButtons({
  tournamentId,
  encerrado,
  partidasAbertas,
}: {
  tournamentId: string
  encerrado: boolean
  /** Nº de partidas em aberto — vem dos dados que a página já tem. */
  partidasAbertas: number
}) {
  const [pendente, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)

  if (encerrado) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            const r = await reabrirTorneio(tournamentId)
            if (r.ok) toast.success("Torneio reaberto.")
            else toast.error(r.error)
          })
        }
      >
        {pendente ? "Reabrindo…" : "Reabrir torneio"}
      </Button>
    )
  }

  if (!confirmando) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirmando(true)}
      >
        Encerrar torneio
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3">
      <p className="text-sm" role="alert">
        {partidasAbertas > 0
          ? `Encerrar agora? ${partidasAbertas} ${partidasAbertas === 1 ? "partida em aberto será congelada e não pontuará" : "partidas em aberto serão congeladas e não pontuarão"}. Você pode reabrir depois.`
          : "Encerrar o torneio? Você pode reabrir depois."}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await encerrarTorneio(tournamentId)
              if (r.ok) toast.success("Torneio encerrado.")
              else toast.error(r.error)
              setConfirmando(false)
            })
          }
        >
          {pendente ? "Encerrando…" : "Confirmar encerramento"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pendente}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
