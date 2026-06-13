"use client"

import { useTransition } from "react"
import { Loader2, Play } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { iniciarDivisao } from "@/actions/leaguePyramid"
import { Button } from "@/components/ui/button"

/**
 * Botão de iniciar UMA divisão (gera a tabela e ativa o torneio da divisão).
 * Folha interativa: chama `iniciarDivisao` com o id da divisão-temporada e
 * atualiza a página. Quando a última divisão é iniciada, a action promove a
 * temporada a 'ativa' — o refresh reflete isso.
 */
export function IniciarDivisaoButton({
  divisionSeasonId,
}: {
  divisionSeasonId: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      size="sm"
      className="rounded-full"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await iniciarDivisao(divisionSeasonId)
          if (r.ok) {
            toast.success("Divisão iniciada! Tabela gerada.")
            router.refresh()
          } else {
            toast.error(r.error)
          }
        })
      }
    >
      {pendente ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Iniciando…
        </>
      ) : (
        <>
          <Play aria-hidden="true" />
          Iniciar divisão
        </>
      )}
    </Button>
  )
}
