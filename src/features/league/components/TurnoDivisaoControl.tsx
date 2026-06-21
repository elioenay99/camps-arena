"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { atualizarIdaEVoltaDivisao } from "@/actions/leaguePyramid"
import { previaLiga } from "@/features/league/gerarTabelaLiga"

/**
 * Controle de turno (ida-e-volta) de uma divisão de LIGA ainda em rascunho.
 * Folha interativa: alterna otimisticamente e chama `atualizarIdaEVoltaDivisao`
 * (thin sobre a RPC transacional). A barreira REAL (status + sonda de rodadas)
 * vive na RPC; aqui `disabled` é só o gate de UX quando a divisão já iniciou.
 */
export function TurnoDivisaoControl({
  divisionSeasonId,
  seasonId,
  tamanho,
  idaEVolta: idaEVoltaInicial,
  disabled = false,
}: {
  divisionSeasonId: string
  seasonId: string
  tamanho: number
  idaEVolta: boolean
  disabled?: boolean
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  // Estado otimista: reflete o toggle na hora; reverte se a action falhar.
  const [idaEVolta, setIdaEVolta] = useState(idaEVoltaInicial)
  const previa = previaLiga(tamanho, idaEVolta)

  function alternar(novo: boolean) {
    const anterior = idaEVolta
    setIdaEVolta(novo)
    iniciar(async () => {
      const r = await atualizarIdaEVoltaDivisao({
        divisionSeasonId,
        seasonId,
        idaEVolta: novo,
      })
      if (r.ok) {
        toast.success(novo ? "Ida e volta ativado." : "Turno único ativado.")
        router.refresh()
      } else {
        setIdaEVolta(anterior)
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
        checked={idaEVolta}
        disabled={disabled || pendente}
        onChange={(e) => alternar(e.target.checked)}
        className="border-input accent-primary size-4 rounded"
      />
      <span className="text-sm">
        Ida e volta (dois turnos)
        <span className="text-muted-foreground block text-xs font-normal">
          {pendente
            ? "Salvando…"
            : `${previa.partidas} ${previa.partidas === 1 ? "partida" : "partidas"} em ${previa.rodadas} ${previa.rodadas === 1 ? "rodada" : "rodadas"}.`}
        </span>
      </span>
    </label>
  )
}
