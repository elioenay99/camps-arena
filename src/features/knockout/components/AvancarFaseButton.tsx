"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { avancarFase } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Botão "Avançar fase" do mata-mata (console do dono). Folha client mínima:
 * action + toast (padrão IniciarTorneioButton). A action valida fase completa
 * e o índice único barra o avanço duplicado — o botão é só UX.
 */
export function AvancarFaseButton({ tournamentId }: { tournamentId: string }) {
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
          if (r.ok) toast.success("Fase gerada!")
          else toast.error(r.error)
        })
      }
    >
      {pendente ? "Gerando fase…" : "Avançar fase"}
    </Button>
  )
}
