"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { encerrarTorneio, reabrirTorneio } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Console de lifecycle do TORNEIO (gate na página por capacidade GERIR;
 * autorização real é action + RLS). Encerrar = capacidade GERIR; é destrutivo na
 * prática (congela tudo): exige confirmação em DOIS cliques com o aviso de
 * partidas abertas — padrão do repo sem AlertDialog (estado local; Cancelar
 * desarma). Reabrir é restrito ao DONO (`podeReabrir`): um admin de equipe gere
 * mas não reabre — decisão reservada a quem criou o torneio. É não-destrutivo e
 * roda direto (useTransition + toast, padrão MatchStatusButton).
 */
export function TournamentLifecycleButtons({
  tournamentId,
  encerrado,
  partidasAbertas,
  podeReabrir,
}: {
  tournamentId: string
  encerrado: boolean
  /** Nº de partidas em aberto — vem dos dados que a página já tem. */
  partidasAbertas: number
  /** Reabrir é exclusivo do DONO (gerir não basta). Torneio encerrado sem esta
   * capacidade não exibe nenhum controle de lifecycle. */
  podeReabrir: boolean
}) {
  const [pendente, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)

  if (encerrado) {
    // Encerrado: só o dono reabre. Admin de equipe (gerir, não-dono) não vê
    // controle de lifecycle aqui.
    if (!podeReabrir) {
      return null
    }
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        // Ação de lifecycle do torneio: alvo de toque de 40px no mobile.
        className="min-h-10 px-4"
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
        className="min-h-10 px-4"
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
          className="min-h-10 px-4"
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
          className="min-h-10 px-4"
          disabled={pendente}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
