"use client"

import { CalendarClock, Layers, Lock, Unlock } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { liberarRodadas } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import type { AlvoLiberacao } from "@/schema/liberacaoSchema"
import { cn } from "@/lib/utils"

type RodadaLiberacao = { rodada: number; total: number; liberada: boolean }

/**
 * Console de LIBERAÇÃO de rodadas (dono — gate na página; autorização real é
 * action + RLS + posse). Folha client no padrão FecharRodadaButton:
 * useTransition + toast (sonner). A action é idempotente (só toca ocultas) e
 * o revalidatePath dela atualiza a página — os pills e a próxima oculta
 * recalculam sozinhos.
 *
 * "Liberar próximas N" deriva das rodadas REALMENTE ocultas (não de aritmética
 * sobre proximaRodadaOculta): com buracos na sequência, somar +2 liberaria
 * rodadas já visíveis ou de menos. O rótulo reflete a contagem real (1/2/3).
 */
export function LiberarRodadasButtons({
  tournamentId,
  rodadasLiberacao,
  proximaRodadaOculta,
  ehGrupos,
}: {
  tournamentId: string
  rodadasLiberacao: RodadaLiberacao[]
  proximaRodadaOculta: number | null
  ehGrupos: boolean
}) {
  const [pendente, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState(false)

  function liberar(alvo: AlvoLiberacao, fallbackSucesso: string) {
    startTransition(async () => {
      const r = await liberarRodadas(tournamentId, alvo)
      if (r.ok) {
        toast.success(
          r.liberadas > 0
            ? `${r.liberadas} ${r.liberadas === 1 ? "partida liberada" : "partidas liberadas"}.`
            : fallbackSucesso
        )
        setConfirmando(false)
      } else {
        toast.error(r.error)
      }
    })
  }

  // Tudo liberado: nada a fazer — exibe só o aviso sutil (e nenhum botão).
  if (proximaRodadaOculta === null) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Todas as rodadas estão liberadas.
      </p>
    )
  }

  // As 3 MENORES rodadas ainda ocultas (reais), para o "liberar próximas N".
  const proximasOcultas = rodadasLiberacao
    .filter((r) => !r.liberada)
    .slice(0, 3)
  const qtdProximas = proximasOcultas.length
  const ultimaProxima = proximasOcultas[qtdProximas - 1]?.rodada
  // Só faz sentido como atalho de "lote" quando há 2+ ocultas (1 já é coberta
  // pelo "Liberar próxima rodada").
  const mostrarProximasN = qtdProximas >= 2 && ultimaProxima !== undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          disabled={pendente}
          onClick={() =>
            liberar(
              { tipo: "rodada", rodada: proximaRodadaOculta },
              "Rodada liberada."
            )
          }
        >
          <Unlock aria-hidden="true" />
          Liberar próxima rodada
        </Button>

        {mostrarProximasN ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={pendente}
            onClick={() =>
              liberar(
                { tipo: "ate", rodada: ultimaProxima },
                "Rodadas liberadas."
              )
            }
          >
            <CalendarClock aria-hidden="true" />
            {`Liberar próximas ${qtdProximas}`}
          </Button>
        ) : null}

        {ehGrupos ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={pendente}
            onClick={() =>
              liberar({ tipo: "faseGrupos" }, "Fase de grupos liberada.")
            }
          >
            <Layers aria-hidden="true" />
            Liberar fase de grupos
          </Button>
        ) : null}

        {confirmando ? (
          <span className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-full px-2 py-1">
            <span className="text-muted-foreground pl-1 text-xs">
              Liberar tudo?
            </span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="rounded-full"
              disabled={pendente}
              onClick={() =>
                liberar({ tipo: "tudo" }, "Todas as rodadas liberadas.")
              }
            >
              {pendente ? "Liberando…" : "Confirmar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={pendente}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={pendente}
            onClick={() => setConfirmando(true)}
          >
            <CalendarClock aria-hidden="true" />
            Liberar tudo
          </Button>
        )}
      </div>

      {/* Estado por rodada: pills com Lock (oculta) / Unlock (liberada). O
          ícone é decorativo (aria-hidden); o sr-only carrega o significado. */}
      <ul className="flex list-none flex-wrap gap-1.5 p-0">
        {rodadasLiberacao.map((r) => (
          <li key={r.rodada} className="min-w-0">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                r.liberada
                  ? "border-border text-muted-foreground"
                  : "border-primary/30 bg-primary/8 text-primary"
              )}
            >
              {r.liberada ? (
                <Unlock className="size-3" aria-hidden="true" />
              ) : (
                <Lock className="size-3" aria-hidden="true" />
              )}
              <span className="truncate">{`Rodada ${r.rodada}`}</span>
              <span className="sr-only">
                {r.liberada ? " liberada" : " oculta"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
