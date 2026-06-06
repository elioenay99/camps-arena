"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { iniciarTorneio } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Botão de início da liga (console do dono). Folha client mínima: action +
 * toast (padrão MatchStatusButton). O `revalidatePath` da action atualiza a
 * página — o painel some e as partidas geradas aparecem. `disabled` é só UX
 * (participantes insuficientes); a autorização real é a action + RLS.
 */
export function IniciarTorneioButton({
  tournamentId,
  disabled = false,
}: {
  tournamentId: string
  disabled?: boolean
}) {
  const [pendente, startTransition] = useTransition()

  return (
    <Button
      type="button"
      disabled={disabled || pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await iniciarTorneio(tournamentId)
          if (r.ok) toast.success("Liga iniciada! Tabela gerada.")
          else toast.error(r.error)
        })
      }
    >
      {pendente ? "Gerando tabela…" : "Iniciar torneio"}
    </Button>
  )
}
