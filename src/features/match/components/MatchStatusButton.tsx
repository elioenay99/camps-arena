"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { encerrarPartida, reabrirPartida, type MatchLifecycleResult } from "@/actions/match"
import { Button } from "@/components/ui/button"

const ACOES: Record<
  "encerrar" | "reabrir",
  {
    rotulo: string
    pendente: string
    sucesso: string
    executar: (matchId: string) => Promise<MatchLifecycleResult>
  }
> = {
  encerrar: {
    rotulo: "Encerrar",
    pendente: "Encerrando…",
    sucesso: "Partida encerrada.",
    executar: encerrarPartida,
  },
  reabrir: {
    rotulo: "Reabrir",
    pendente: "Reabrindo…",
    sucesso: "Partida reaberta.",
    executar: reabrirPartida,
  },
}

/**
 * Botão de transição de status (console do dono). Folha client mínima:
 * action + toast (padrão MatchScoreModalConnected). O `revalidatePath` das
 * actions atualiza a página — sem estado local além do pending.
 */
export function MatchStatusButton({
  matchId,
  acao,
}: {
  matchId: string
  acao: "encerrar" | "reabrir"
}) {
  const [pendente, startTransition] = useTransition()
  const config = ACOES[acao]

  return (
    <Button
      type="button"
      size="sm"
      variant={acao === "encerrar" ? "default" : "outline"}
      // Ação irreversível (encerrar/reabrir partida): alvo de toque de 40px
      // no mobile (a base size="sm" tem h-7). Padding extra evita largura
      // estreita demais para o dedo.
      className="min-h-10 px-4"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await config.executar(matchId)
          if (r.ok) toast.success(config.sucesso)
          else toast.error(r.error)
        })
      }
    >
      {pendente ? config.pendente : config.rotulo}
    </Button>
  )
}
