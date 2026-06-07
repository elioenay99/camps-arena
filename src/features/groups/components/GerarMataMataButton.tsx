"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { gerarMataMataDosGrupos } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"

/**
 * Botão "Gerar mata-mata" dos formatos de grupos (console do dono). Folha
 * client mínima (padrão AvancarFaseButton). `pendentes > 0` desabilita com
 * orientação — a action revalida tudo de qualquer forma. Quando a
 * classificação precisou de SORTEIO na linha de corte, o aviso é exibido
 * (decisão de produto: sorteio automático com aviso visível).
 */
export function GerarMataMataButton({
  tournamentId,
  pendentes,
}: {
  tournamentId: string
  /** Jogos de grupos ainda não encerrados (gate de UX). */
  pendentes: number
}) {
  const [pendente, startTransition] = useTransition()
  const bloqueado = pendentes > 0

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente || bloqueado}
        onClick={() =>
          startTransition(async () => {
            const r = await gerarMataMataDosGrupos(tournamentId)
            if (r.ok) {
              toast.success("Mata-mata gerado!")
              if (r.sorteioUsado) {
                toast.warning(
                  "Houve empate total na linha de corte — a classificação foi decidida por sorteio."
                )
              }
            } else {
              toast.error(r.error)
            }
          })
        }
      >
        {pendente ? "Gerando…" : "Gerar mata-mata"}
      </Button>
      {bloqueado ? (
        <span className="text-muted-foreground text-xs">
          {pendentes === 1
            ? "Falta 1 jogo da fase de grupos."
            : `Faltam ${pendentes} jogos da fase de grupos.`}
        </span>
      ) : null}
    </div>
  )
}
