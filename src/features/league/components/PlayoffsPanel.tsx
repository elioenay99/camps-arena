"use client"

import type { ReactNode } from "react"
import { useTransition } from "react"
import {
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpToLine,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Swords,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { montarPlayoffs } from "@/actions/leaguePyramid"
import { AvancarFaseButton } from "@/features/knockout/components/AvancarFaseButton"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Tipos da folha — o BracketView (RSC) chega já renderizado como ReactNode    */
/* -------------------------------------------------------------------------- */

/**
 * Uma fronteira de playoff para o painel. O `bracket` é o `<BracketView />` JÁ
 * renderizado no SERVIDOR (a page o monta) — o BracketView é RSC e não pode virar
 * client; o painel só cuida dos botões (montar / avançar fase) e do estado.
 */
export interface PlayoffFronteiraView {
  nivelSuperior: number
  modo: "playoff_acesso" | "playout" | "barragem_cruzada"
  estilo: "vagas" | "extra" | "pares" | "chave"
  playoffVagas: number
  vagasAcesso: number
  vagasRebaixamento: number
  playoffTournamentId: string | null
  torneioStatus: "rascunho" | "ativo" | "encerrado" | null
  decidida: boolean
  /** Nº de partidas da chave (insumo do estado "pendente"). */
  totalPartidas: number
  /** O BracketView server-rendered, ou null quando a chave não foi montada. */
  bracket: ReactNode
}

export interface PlayoffsPanelProps {
  seasonId: string
  fronteiras: PlayoffFronteiraView[]
  /** Nome legível de cada nível (1 → "Série A") — rótulo das fronteiras. */
  nivelNomes?: Record<number, string | undefined>
}

/* -------------------------------------------------------------------------- */
/* Helpers de apresentação                                                     */
/* -------------------------------------------------------------------------- */

function rotuloNivel(nivel: number, nomes?: PlayoffsPanelProps["nivelNomes"]) {
  return nomes?.[nivel] ?? `Divisão ${nivel}`
}

const MODO_LABEL: Record<PlayoffFronteiraView["modo"], string> = {
  playoff_acesso: "Playoff de acesso",
  playout: "Playout",
  barragem_cruzada: "Barragem cruzada",
}

const ESTILO_LABEL: Record<PlayoffFronteiraView["estilo"], string> = {
  vagas: "a chave decide as vagas",
  extra: "direto + 1 na chave",
  pares: "confrontos 1×1",
  chave: "chave única entre as divisões",
}

/**
 * Esconde o "Avançar fase" quando não há MAIS fase a gerar:
 * - estilo `vagas`: a chave para na rodada `f` (NÃO vai à final). Quando a chave
 *   resolve (`decidida`), os `vagasAcesso` sobreviventes (acesso) — ou os
 *   `playoffVagas - vagasRebaixamento` salvos (playout) — já estão definidos
 *   na rodada `f = log2(playoffVagas/sobreviventes)`; gerar a próxima fase seria
 *   um jogo SEM efeito no sobe/cai. `resultadoDaChave` marca `decidida` exatamente
 *   nessa rodada, então `decidida` é o sinal de parada.
 * - estilo `extra`: a chave vai à FINAL; `decidida` = final resolvida.
 * Em ambos, `decidida` é a fronteira do esconde — fonte única com o motor.
 */
function escondeAvancar(f: PlayoffFronteiraView): boolean {
  // Barragem `pares`: B confrontos 1×1 numa rodada ÚNICA — nunca há próxima fase
  // a gerar (não é um bracket que reduz a um campeão). Esconde sempre.
  if (f.modo === "barragem_cruzada" && f.estilo === "pares") return true
  return f.decidida
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Painel de PLAYOFFS de fim de temporada (Fase 2). Aparece entre as Divisões e o
 * Fim-de-temporada quando todas as divisões encerraram e há fronteira de playoff
 * ainda não resolvida. Fluxo:
 * 1. Nenhuma chave montada → botão "Montar playoffs" (`montarPlayoffs`).
 * 2. Por fronteira montada: rótulo (nível ⇄ nível, modo, estilo) + BracketView
 *    (server-rendered) + "Abrir chave" (lança placares) + "Avançar fase".
 *
 * Folha client: só os botões (useTransition + toast + router.refresh). O
 * BracketView é RSC e chega por prop `bracket` — esta folha nunca o re-renderiza.
 */
export function PlayoffsPanel({
  seasonId,
  fronteiras,
  nivelNomes,
}: PlayoffsPanelProps) {
  const router = useRouter()
  const [montando, iniciarMontagem] = useTransition()

  const algumaMontada = fronteiras.some((f) => f.playoffTournamentId !== null)

  function montar() {
    iniciarMontagem(async () => {
      const r = await montarPlayoffs(seasonId)
      if (r.ok) {
        toast.success("Playoffs montados. Abra as chaves e lance os placares.")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  /* --------------------- Estado: nenhuma chave montada -------------------- */
  if (!algumaMontada) {
    return (
      <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-12 text-center">
        <span
          aria-hidden="true"
          className="glow-primary flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <Swords className="size-6" />
        </span>
        <div className="flex max-w-sm flex-col gap-1.5">
          <h3 className="font-display text-lg font-bold">Monte os playoffs</h3>
          <p className="text-muted-foreground text-sm">
            As divisões encerraram. Algumas fronteiras decidem o acesso ou a
            queda numa chave eliminatória — monte as chaves para jogá-las antes
            do sobe e cai.
          </p>
        </div>
        <Button
          type="button"
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
              Montar playoffs
            </>
          )}
        </Button>
      </Card>
    )
  }

  /* --------------------- Estado: chaves montadas ------------------------- */
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h3 className="font-display text-lg font-bold tracking-tight">
          Playoffs
        </h3>
        <p className="text-muted-foreground text-sm">
          A chave decide o acesso ou a queda desta fronteira. Lance os placares
          e avance as fases até a chave resolver — depois o sobe e cai é liberado.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {fronteiras.map((f, i) => (
          <FronteiraChave
            key={f.nivelSuperior}
            fronteira={f}
            nivelNomes={nivelNomes}
            ordem={i}
          />
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                              */
/* -------------------------------------------------------------------------- */

function FronteiraChave({
  fronteira,
  nivelNomes,
  ordem,
}: {
  fronteira: PlayoffFronteiraView
  nivelNomes?: PlayoffsPanelProps["nivelNomes"]
  ordem: number
}) {
  const router = useRouter()
  const { modo, playoffTournamentId, torneioStatus, decidida } = fronteira
  const Icon =
    modo === "barragem_cruzada"
      ? ArrowUpDown
      : modo === "playoff_acesso"
        ? ArrowUpToLine
        : ArrowDownToLine
  const nomeSup = rotuloNivel(fronteira.nivelSuperior, nivelNomes)
  const nomeInf = rotuloNivel(fronteira.nivelSuperior + 1, nivelNomes)

  return (
    <section
      aria-label={`${MODO_LABEL[modo]} entre ${nomeSup} e ${nomeInf}`}
      className="animate-rise flex flex-col gap-3"
      style={{ "--stagger": `${ordem * 60}ms` } as React.CSSProperties}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h4 className="font-display flex flex-wrap items-center gap-x-1.5 text-sm font-bold tracking-tight">
              <span className="truncate">{nomeSup}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                ⇄
              </span>
              <span className="truncate">{nomeInf}</span>
            </h4>
            <p className="text-muted-foreground text-xs">
              {MODO_LABEL[modo]} · {ESTILO_LABEL[fronteira.estilo]}
            </p>
          </div>
        </div>
        <EstadoChave decidida={decidida} status={torneioStatus} />
      </div>

      {/* BracketView server-rendered — esta folha client nunca o re-renderiza. */}
      {fronteira.bracket}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {playoffTournamentId ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground rounded-full"
          >
            <Link href={`/dashboard/torneios/${playoffTournamentId}`}>
              <ExternalLink aria-hidden="true" />
              Abrir chave
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {playoffTournamentId && !escondeAvancar(fronteira) ? (
          // `avancarFase` revalida só as rotas de torneio; o refresh atualiza a
          // página da liga (BracketView, chip "Decidida", portão do fluxo).
          <AvancarFaseButton
            tournamentId={playoffTournamentId}
            onAdvanced={() => router.refresh()}
          />
        ) : null}
      </div>
    </section>
  )
}

/** Chip de estado da chave: pendente / decidida / encerrada. */
function EstadoChave({
  decidida,
  status,
}: {
  decidida: boolean
  status: PlayoffFronteiraView["torneioStatus"]
}) {
  if (status === "encerrado") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          "border-gold/30 bg-gold/10 text-gold-ink"
        )}
      >
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Encerrada
      </span>
    )
  }
  if (decidida) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          "border-primary/30 bg-primary/10 text-primary"
        )}
      >
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Decidida
      </span>
    )
  }
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
      Pendente
    </span>
  )
}
