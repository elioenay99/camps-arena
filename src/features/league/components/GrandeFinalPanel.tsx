"use client"

import type { ReactNode } from "react"
import { useTransition } from "react"
import { ExternalLink, Loader2, Swords, Trophy } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { montarGrandesFinais } from "@/actions/leaguePyramid"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { GrandeFinalDivisao } from "@/features/league/data/getGrandeFinal"

export interface GrandeFinalPanelProps {
  /** Divisão-temporada desta grande final (rotulagem/keying). */
  divisionSeasonId: string
  /** Id da TEMPORADA — a action `montarGrandesFinais` recebe o seasonId. */
  seasonId: string
  grandeFinal: GrandeFinalDivisao
  /**
   * O `<BracketView />` JÁ renderizado no SERVIDOR (a page o monta). O BracketView
   * é RSC e não pode virar client; esta folha só cuida do botão e do estado —
   * mesmo padrão do PlayoffsPanel recebendo o bracket por prop.
   */
  bracket: ReactNode
  /**
   * Capacidade GERIR (add-liga-visao-leitura). Quando `false` (leitor), o único
   * controle de gestão — o botão "Montar grande final" (estado `montar`) — é
   * ocultado; o bracket/resultado (leitura) permanece. Default `true` (a página
   * sempre passa o valor real).
   */
  podeGerir?: boolean
}

/**
 * Painel da GRANDE FINAL de uma divisão de season split (Fase 5.1). Decorativo:
 * só coroa o campeão da divisão (a tabela ANUAL COMBINADA decide o sobe/cai, não o
 * título). Render por `grandeFinal.estado`:
 *  - `pendente`: nota — a final abre quando os dois turnos encerrarem (sem botão).
 *  - `montar`: botão "Montar grande final" (`montarGrandesFinais(seasonId)`).
 *  - `em_andamento`: bracket + link "Abrir grande final" para lançar placares.
 *  - `decidida`: bracket + destaque do campeão (troféu + nome).
 *  - `campeao_direto`: destaque do campeão (sem bracket) — venceu os dois turnos.
 *
 * Folha client: só o botão de montar (useTransition + toast + router.refresh). O
 * BracketView chega server-rendered por `bracket` — esta folha nunca o re-renderiza.
 */
export function GrandeFinalPanel({
  seasonId,
  grandeFinal,
  bracket,
  podeGerir = true,
}: GrandeFinalPanelProps) {
  const router = useRouter()
  const [montando, iniciarMontagem] = useTransition()

  function montar() {
    iniciarMontagem(async () => {
      const r = await montarGrandesFinais(seasonId)
      if (r.ok) {
        toast.success("Grande final montada. Lance os placares da final.")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  switch (grandeFinal.estado) {
    /* ---------------------------- Pendente -------------------------------- */
    case "pendente":
      return (
        <p
          role="status"
          className="text-muted-foreground border-border bg-muted/30 rounded-lg border px-3 py-2 text-xs"
        >
          A grande final será liberada quando os dois turnos encerrarem.
        </p>
      )

    /* ----------------------------- Montar -------------------------------- */
    case "montar":
      // Único controle de gestão do painel: o leitor não o vê (a final ainda não
      // foi montada, logo não há bracket a exibir) — nada a renderizar.
      if (!podeGerir) return null
      return (
        <Card className="elevate flex flex-col items-center gap-4 px-4 py-6 text-center">
          <span
            aria-hidden="true"
            className="glow-primary flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          >
            <Swords className="size-5" />
          </span>
          <div className="flex max-w-xs flex-col gap-1">
            <h3 className="font-display text-base font-bold">Grande final</h3>
            <p className="text-muted-foreground text-sm">
              Os dois turnos encerraram com campeões distintos. Monte a grande
              final (ida e volta) para coroar o campeão da divisão.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={montar}
            disabled={montando}
          >
            {montando ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Montando…
              </>
            ) : (
              <>
                <Swords aria-hidden="true" />
                Montar grande final
              </>
            )}
          </Button>
        </Card>
      )

    /* -------------------------- Em andamento ----------------------------- */
    case "em_andamento":
      return (
        <section
          aria-label="Grande final"
          className="flex flex-col gap-3"
        >
          <h3 className="font-display text-base font-bold tracking-tight">
            Grande final
          </h3>
          {bracket}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">
              Final em andamento — lance os placares no torneio da final.
            </p>
            {grandeFinal.finalTournamentId ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground rounded-full"
              >
                {/* Sem prefetch: link p/ rota de torneio (RSC cara). Evita somar
                    à rajada de prefetches da liga que estourava a borda da
                    Vercel (503). Ver add-dashboard-prefetch-hardening. */}
                <Link
                  href={`/dashboard/torneios/${grandeFinal.finalTournamentId}`}
                  prefetch={false}
                >
                  <ExternalLink aria-hidden="true" />
                  Abrir grande final
                </Link>
              </Button>
            ) : null}
          </div>
        </section>
      )

    /* ---------------------------- Decidida ------------------------------- */
    case "decidida":
      return (
        <section aria-label="Grande final" className="flex flex-col gap-3">
          <h3 className="font-display text-base font-bold tracking-tight">
            Grande final
          </h3>
          {bracket}
          <CampeaoDestaque nome={grandeFinal.campeaoNome} />
        </section>
      )

    /* ------------------------- Campeão direto ---------------------------- */
    case "campeao_direto":
      return (
        <section aria-label="Campeão da divisão" className="flex flex-col gap-2">
          <CampeaoDestaque nome={grandeFinal.campeaoNome} />
          <p className="text-muted-foreground text-xs">
            Campeão dos dois turnos — sem grande final.
          </p>
        </section>
      )

    default:
      return null
  }
}

/**
 * Destaque do campeão da divisão: troféu + nome + rótulo. Mesma família visual do
 * líder da StandingsTable (gold/gold-ink) e do campeão do BracketView.
 */
function CampeaoDestaque({ nome }: { nome: string | null }) {
  return (
    <p className="trophy-sheen animate-rise flex items-center gap-2.5 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm shadow-[0_0_28px_-8px_color-mix(in_oklch,var(--gold)_45%,transparent)]">
      <Trophy className="size-5 shrink-0 text-gold-ink" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="font-display truncate font-bold tracking-wide text-gold-ink">
          {nome ?? "Sem nome"}
        </span>
        <span className="text-muted-foreground text-xs font-medium">
          Campeão da divisão
        </span>
      </span>
    </p>
  )
}
