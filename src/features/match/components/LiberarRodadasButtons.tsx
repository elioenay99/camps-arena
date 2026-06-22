"use client"

import { CalendarClock, Layers, Lock, Unlock } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { liberarRodadas, recolherRodadas } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import type { AlvoLiberacao, AlvoRecolhimento } from "@/schema/liberacaoSchema"
import { cn } from "@/lib/utils"

type RodadaLiberacao = { rodada: number; total: number; liberada: boolean }

/**
 * Console de cadência de rodadas (dono — gate na página; autorização real é
 * action + RLS + posse). Libera rodadas ocultas E recolhe rodadas liberadas
 * (change add-recolher-rodadas). Folha client no padrão FecharRodadaButton:
 * useTransition + toast (sonner). As actions são idempotentes; o revalidatePath
 * delas atualiza a página — os pills e a "próxima oculta"/"última liberada"
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
  // null | "liberar" | "recolher": só UM bloco de confirmação fica ativo por vez
  // (Liberar/Recolher tudo coexistem no estado MISTO — um booleano colidiria).
  const [confirmando, setConfirmando] = useState<null | "liberar" | "recolher">(null)

  function liberar(alvo: AlvoLiberacao, fallbackSucesso: string) {
    startTransition(async () => {
      const r = await liberarRodadas(tournamentId, alvo)
      if (r.ok) {
        toast.success(
          r.liberadas > 0
            ? `${r.liberadas} ${r.liberadas === 1 ? "partida liberada" : "partidas liberadas"}.`
            : fallbackSucesso
        )
        setConfirmando(null)
      } else {
        toast.error(r.error)
      }
    })
  }

  function recolher(alvo: AlvoRecolhimento) {
    startTransition(async () => {
      const r = await recolherRodadas(tournamentId, alvo)
      if (r.ok) {
        if (r.recolhidas > 0) {
          toast.success(
            `${r.recolhidas} ${r.recolhidas === 1 ? "partida recolhida" : "partidas recolhidas"}.`
          )
        } else {
          // No-op (rodada já oculta / nada no alvo): info, não "sucesso" enganoso.
          toast.info("Nenhuma partida para recolher.")
        }
        setConfirmando(null)
      } else {
        toast.error(r.error)
      }
    })
  }

  // As 3 MENORES rodadas ainda ocultas (reais), para o "liberar próximas N".
  const proximasOcultas = rodadasLiberacao.filter((r) => !r.liberada).slice(0, 3)
  const qtdProximas = proximasOcultas.length
  const ultimaProxima = proximasOcultas[qtdProximas - 1]?.rodada
  // Só faz sentido como atalho de "lote" quando há 2+ ocultas (1 já é coberta
  // pelo "Liberar próxima rodada").
  const mostrarProximasN = qtdProximas >= 2 && ultimaProxima !== undefined

  const temOcultas = proximaRodadaOculta !== null
  // Rodadas liberadas (asc) → a ÚLTIMA é a maior; base do "recolher última".
  const liberadas = rodadasLiberacao.filter((r) => r.liberada)
  const ultimaLiberada = liberadas[liberadas.length - 1]?.rodada
  const temLiberadas = ultimaLiberada !== undefined

  return (
    <div className="flex flex-col gap-4">
      {/* ----- LIBERAR (há rodada oculta) ----- */}
      {temOcultas ? (
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
                liberar({ tipo: "ate", rodada: ultimaProxima }, "Rodadas liberadas.")
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

          {confirmando === "liberar" ? (
            <span className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-full px-2 py-1">
              <span className="text-muted-foreground pl-1 text-xs">Liberar tudo?</span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="rounded-full"
                disabled={pendente}
                onClick={() => liberar({ tipo: "tudo" }, "Todas as rodadas liberadas.")}
              >
                {pendente ? "Liberando…" : "Confirmar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full"
                disabled={pendente}
                onClick={() => setConfirmando(null)}
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
              onClick={() => setConfirmando("liberar")}
            >
              <CalendarClock aria-hidden="true" />
              Liberar tudo
            </Button>
          )}
        </div>
      ) : null}

      {/* ----- RECOLHER (há rodada liberada) ----- */}
      {temLiberadas ? (
        <div className="flex flex-wrap items-center gap-2">
          {!temOcultas ? (
            <p className="text-muted-foreground w-full text-sm" role="status">
              Todas as rodadas estão liberadas — você pode recolher.
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={pendente}
            onClick={() => recolher({ tipo: "rodada", rodada: ultimaLiberada })}
          >
            <Lock aria-hidden="true" />
            Recolher última rodada
          </Button>

          {ehGrupos ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={pendente}
              onClick={() => recolher({ tipo: "faseGrupos" })}
            >
              <Layers aria-hidden="true" />
              Recolher fase de grupos
            </Button>
          ) : null}

          {confirmando === "recolher" ? (
            <span className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-full px-2 py-1">
              <span className="text-muted-foreground pl-1 text-xs">
                Recolher tudo? (volta a nenhuma liberada)
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="rounded-full"
                disabled={pendente}
                onClick={() => recolher({ tipo: "tudo" })}
              >
                {pendente ? "Recolhendo…" : "Confirmar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full"
                disabled={pendente}
                onClick={() => setConfirmando(null)}
              >
                Cancelar
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={pendente}
              onClick={() => setConfirmando("recolher")}
            >
              <Lock aria-hidden="true" />
              Recolher tudo
            </Button>
          )}
        </div>
      ) : null}

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
              <span className="sr-only">{r.liberada ? " liberada" : " oculta"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
