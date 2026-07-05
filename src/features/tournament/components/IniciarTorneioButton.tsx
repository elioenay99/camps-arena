"use client"

import { useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { iniciarTorneio } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Botão de início da liga (console do dono). Folha client mínima: action +
 * toast (padrão MatchStatusButton). O `revalidatePath` da action atualiza a
 * página — o painel some e as partidas geradas aparecem. `disabled` é só UX
 * (participantes insuficientes); a autorização real é a action + RLS.
 *
 * Cadência (change add-liberacao-rodadas): checkbox "Liberar todas as rodadas
 * agora" MARCADO por padrão (comportamento atual). Desmarcado ⇒
 * `iniciarTorneio(id, false)` ⇒ rodadas nascem ocultas até o dono liberar.
 */
export function IniciarTorneioButton({
  tournamentId,
  disabled = false,
}: {
  tournamentId: string
  disabled?: boolean
}) {
  const [pendente, startTransition] = useTransition()
  const [liberarTudo, setLiberarTudo] = useState(true)
  const id = useId()

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-2.5 text-sm"
      >
        <input
          id={id}
          type="checkbox"
          checked={liberarTudo}
          onChange={(e) => setLiberarTudo(e.target.checked)}
          disabled={disabled || pendente}
          className="border-input accent-primary mt-0.5 size-4 shrink-0 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Liberar todas as rodadas agora</span>
          <span className="text-muted-foreground text-xs">
            No modo manual, as rodadas ficam ocultas até você liberar.
          </span>
        </span>
      </label>

      <div>
        <Button
          type="button"
          disabled={disabled || pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await iniciarTorneio(tournamentId, liberarTudo)
              if (r.ok) toast.success("Torneio iniciado! Tabela gerada.")
              else toast.error(r.error)
            })
          }
        >
          {pendente ? "Gerando tabela…" : "Iniciar torneio"}
        </Button>
      </div>
    </div>
  )
}
