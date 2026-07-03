"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { definirListadaLiga } from "@/actions/leaguePyramid"
import { definirListadaTorneio } from "@/actions/tournaments"

type Props =
  | { tipo: "torneio"; tournamentId: string; listada: boolean }
  | { tipo: "liga"; competitionId: string; seasonId: string; listada: boolean }

/**
 * Toggle "Listar na vitrine pública" (change add-vitrine-publica-e-compartilhar).
 * Folha interativa que espelha `TurnoDivisaoControl`: alterna otimisticamente e
 * chama a Server Action do escopo (torneio ou liga). A barreira REAL de
 * autorização (`podeGerir` + RLS de dono) vive na action; aqui é só UX — o toggle
 * já vem gateado pela página (só `podeGerir`, e no torneio só `!ehDivisao`).
 */
export function ListarVitrineToggle(props: Props) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [listada, setListada] = useState(props.listada)

  function alternar(novo: boolean) {
    const anterior = listada
    setListada(novo)
    iniciar(async () => {
      const r =
        props.tipo === "torneio"
          ? await definirListadaTorneio({
              tournamentId: props.tournamentId,
              listada: novo,
            })
          : await definirListadaLiga({
              competitionId: props.competitionId,
              seasonId: props.seasonId,
              listada: novo,
            })
      if (r.ok) {
        toast.success(
          novo ? "Listado na vitrine pública." : "Removido da vitrine pública."
        )
        router.refresh()
      } else {
        setListada(anterior)
        toast.error(r.error)
      }
    })
  }

  return (
    <label
      aria-busy={pendente}
      className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex w-full max-w-xs cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors has-[:focus-visible]:ring-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <input
        type="checkbox"
        checked={listada}
        disabled={pendente}
        onChange={(e) => alternar(e.target.checked)}
        className="border-input accent-primary size-4 rounded"
      />
      <span className="text-sm">
        Listar na vitrine pública
        <span className="text-muted-foreground block text-xs font-normal">
          {pendente
            ? "Salvando…"
            : "Aparece na aba Explorar para qualquer pessoa."}
        </span>
      </span>
    </label>
  )
}
