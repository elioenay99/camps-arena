import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLink, Layers } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FluxoTemporadaPanel } from "@/features/league/components/FluxoTemporadaPanel"
import { IniciarDivisaoButton } from "@/features/league/components/IniciarDivisaoButton"
import { MontarTemporadaButton } from "@/features/league/components/MontarTemporadaButton"
import { SeasonStatusPill } from "@/features/league/components/SeasonStatusPill"
import {
  getDivisionStandings,
  type DivisaoStandings,
} from "@/features/league/data/getDivisionStandings"
import {
  getSeason,
  type DivisaoTemporada,
} from "@/features/league/data/getSeason"
import { StandingsTable } from "@/features/standings/components/StandingsTable"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const fallback = { title: "Temporada · Goliseu" }
  if (!z.uuid().safeParse(id).success) {
    return fallback
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return fallback
  }
  const temporada = await getSeason(id, user.id)
  const nome = temporada?.competicao.nome.trim()
  return nome ? { title: `${nome} · Goliseu` } : fallback
}

export default async function TemporadaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02.
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/ligas/${id}`)
  }

  // Temporada inexistente OU de liga alheia (filtro de posse): mesma resposta
  // 404 — sem oráculo de existência.
  const temporada = await getSeason(id, user.id)
  if (!temporada) {
    notFound()
  }

  // "Não montada" = nenhuma divisão virou torneio ainda (tournament_id null).
  // NÃO usar o status da season: ele continua 'rascunho' DEPOIS de montar (só
  // vira 'ativa' ao iniciar TODAS as divisões), então decidir por ele esconderia
  // o "Iniciar divisão" e prenderia o dono no card de montagem.
  const naoMontada = temporada.divisoes.every((d) => d.tournamentId === null)

  // Classificação de cada divisão (em paralelo). Não montada → sem torneio →
  // standings null, sem tabela.
  const standingsPorDivisao = naoMontada
    ? temporada.divisoes.map(() => null)
    : await Promise.all(
        temporada.divisoes.map((div) =>
          getDivisionStandings(div.id, user.id, temporada.fronteiras)
        )
      )

  // Mapa nível → nome (para o FluxoTemporadaPanel rotular as divisões).
  const nivelNomes: Record<number, string> = {}
  for (const div of temporada.divisoes) nivelNomes[div.nivel] = div.nome

  // Fim de temporada: ATIVA com todas as divisões já encerradas (torneios
  // encerrados) → habilita o painel de sobe e cai.
  const todasEncerradas =
    temporada.status === "ativa" &&
    standingsPorDivisao.length > 0 &&
    standingsPorDivisao.every((s) => s?.status === "encerrado")

  // 'em_fluxo' = a confirmação começou mas não concluiu (falha parcial entre
  // 'em_fluxo' e 'encerrada'). O painel reaparece para RETOMAR — confirmar é
  // idempotente (recalcula com a mesma semente = id da temporada). Sem isto o
  // dono ficaria num beco sem saída (vê os torneios encerrados, sem console).
  const emRetomada = temporada.status === "em_fluxo"
  const mostrarFluxo = todasEncerradas || emRetomada

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <Layers className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">
              {temporada.competicao.nome.trim() || "Pirâmide"}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <SeasonStatusPill status={temporada.status} />
              <Chip>{`Temporada ${temporada.numero}`}</Chip>
              <Chip>
                {temporada.divisoes.length === 1
                  ? "1 divisão"
                  : `${temporada.divisoes.length} divisões`}
              </Chip>
            </div>
          </div>
        </div>
      </header>

      {/* Não montada: a temporada existe mas as divisões ainda não viraram
          torneios. Monte para criar os torneios e as vagas. */}
      {naoMontada ? (
        <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="glow-primary flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          >
            <Layers className="size-6" />
          </span>
          <div className="flex max-w-sm flex-col gap-1.5">
            <h2 className="font-display text-lg font-bold">Monte a temporada</h2>
            <p className="text-muted-foreground text-sm">
              Cada divisão vira um torneio de liga com as vagas dos competidores.
              Depois, inicie cada divisão para gerar a tabela.
            </p>
          </div>
          <MontarTemporadaButton seasonId={temporada.seasonId} />
        </Card>
      ) : (
        <section aria-label="Divisões" className="flex flex-col gap-5">
          {temporada.divisoes.map((div, i) => (
            <DivisaoCard
              key={div.id}
              divisao={div}
              standings={standingsPorDivisao[i]}
              ordem={i}
            />
          ))}
        </section>
      )}

      {/* Fim de temporada: todas as divisões encerradas (ou retomada de um
          fluxo interrompido) → sobe e cai. */}
      {mostrarFluxo ? (
        <section
          aria-labelledby="fluxo-titulo"
          className="flex flex-col gap-4 border-t pt-6"
        >
          <h2
            id="fluxo-titulo"
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Fim de temporada
          </h2>
          {emRetomada ? (
            <p
              role="status"
              className="border-accent/30 bg-accent/10 text-accent-foreground rounded-lg border px-3 py-2 text-sm"
            >
              O fluxo desta temporada começou mas não foi concluído. Calcule e
              confirme novamente para gerar a próxima temporada — nada é refeito
              em dobro.
            </p>
          ) : null}
          <FluxoTemporadaPanel
            seasonId={temporada.seasonId}
            competidores={temporada.competidores}
            nivelNomes={nivelNomes}
          />
        </section>
      ) : null}
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                             */
/* -------------------------------------------------------------------------- */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}

/** Um nível da pirâmide: cabeçalho + tabela (com zonas) ou estado de início. */
function DivisaoCard({
  divisao,
  standings,
  ordem,
}: {
  divisao: DivisaoTemporada
  standings: DivisaoStandings | null
  ordem: number
}) {
  // Sem torneio (não montada) — não deveria ocorrer fora do rascunho, mas é
  // defesa. Montada mas não iniciada (rascunho do torneio): botão de iniciar.
  const naoIniciada =
    divisao.tournamentId !== null &&
    (standings === null || standings.status === "rascunho")

  return (
    <section
      aria-labelledby={`div-${divisao.id}`}
      className="animate-rise flex flex-col gap-3"
      style={{ "--stagger": `${ordem * 60}ms` } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`div-${divisao.id}`}
          className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-6 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary tabular-nums"
          >
            {divisao.nivel}
          </span>
          {divisao.nome.trim() || `Divisão ${divisao.nivel}`}
        </h2>
        {divisao.tournamentId ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground rounded-full"
          >
            <Link href={`/dashboard/torneios/${divisao.tournamentId}`}>
              <ExternalLink aria-hidden="true" />
              Abrir torneio
            </Link>
          </Button>
        ) : null}
      </div>

      {standings && standings.status !== "rascunho" ? (
        <StandingsTable
          linhas={standings.linhas}
          rotuloLado={divisao.porNome ? "Competidor" : "Clube"}
          zonas={standings.zonas}
        />
      ) : (
        <Card className="elevate" size="sm">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-muted-foreground max-w-xs text-sm">
              {naoIniciada
                ? "Divisão montada. Inicie para gerar a tabela e abrir as partidas."
                : "Divisão ainda não montada."}
            </p>
            {naoIniciada ? (
              <IniciarDivisaoButton divisionSeasonId={divisao.id} />
            ) : null}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
