"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { avancarFase } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Botão "Avançar fase" do mata-mata (console do dono). Folha client mínima:
 * action + toast (padrão IniciarTorneioButton). A action valida fase completa
 * e o índice único barra o avanço duplicado — o botão é só UX.
 *
 * `onAdvanced` (opcional): callback no sucesso — usado pelo PlayoffsPanel para
 * `router.refresh()` (a action `avancarFase` revalida só as rotas de torneio, não
 * a da liga; sem o refresh a página da temporada ficaria stale após avançar).
 */
export function AvancarFaseButton({
  tournamentId,
  onAdvanced,
}: {
  tournamentId: string
  onAdvanced?: () => void
}) {
  const [pendente, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await avancarFase(tournamentId)
          if (r.ok) {
            toast.success("Fase gerada!")
            onAdvanced?.()
          } else toast.error(r.error)
        })
      }
    >
      {pendente ? "Gerando fase…" : "Avançar fase"}
    </Button>
  )
}
