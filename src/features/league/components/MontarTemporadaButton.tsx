"use client"

import { useTransition } from "react"
import { Hammer, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { montarTemporada } from "@/actions/leaguePyramid"
import { Button } from "@/components/ui/button"

/**
 * Botão de montar a temporada (rascunho → divisões com torneios). Folha
 * interativa: chama a action `montarTemporada` e atualiza a página via
 * `router.refresh()`. Toast de sucesso/erro no padrão do projeto.
 */
export function MontarTemporadaButton({ seasonId }: { seasonId: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      type="button"
      className="rounded-full"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await montarTemporada(seasonId)
          if (r.ok) {
            toast.success("Temporada montada. Inicie as divisões.")
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
          Montando…
        </>
      ) : (
        <>
          <Hammer aria-hidden="true" />
          Montar temporada
        </>
      )}
    </Button>
  )
}
