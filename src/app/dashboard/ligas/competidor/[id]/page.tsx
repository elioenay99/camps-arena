import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarOff } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getCompetitorProfile } from "@/features/league/data/getCompetitorProfile"
import { getArtilheirosDoCompetidor } from "@/features/league/data/getArtilheirosDoCompetidor"
import { getConquistasDoCompetidor } from "@/features/league/data/getConquistasDoCompetidor"
import { getTecnicosDoCompetidor } from "@/features/league/data/getTecnicosDoCompetidor"
import { getCompetidorInsights } from "@/features/league/data/getCompetidorInsights"
import { getRivaisDoCompetidor } from "@/features/league/data/getRivaisDoCompetidor"
import { createClient } from "@/lib/supabase/server"
import { CompetidorHero } from "@/features/league/components/competidor/CompetidorHero"
import { CompetidorForma } from "@/features/league/components/competidor/CompetidorForma"
import { ConfrontoDiretoPanel } from "@/features/league/components/competidor/ConfrontoDiretoPanel"
import { CompetidorAgregados } from "@/features/league/components/competidor/CompetidorAgregados"
import { CompetidorArtilheiros } from "@/features/league/components/competidor/CompetidorArtilheiros"
import { CompetidorConquistas } from "@/features/league/components/competidor/CompetidorConquistas"
import { CompetidorHallDaFama } from "@/features/league/components/competidor/CompetidorHallDaFama"
import { CompetidorTecnicos } from "@/features/league/components/competidor/CompetidorTecnicos"
import { PromedioEvolucao } from "@/features/league/components/competidor/PromedioEvolucao"
import { TemporadaTimeline } from "@/features/league/components/competidor/TemporadaTimeline"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const fallback = { title: "Competidor · Goliseu" }
  // uuid validado antes da query: lixo de URL não vira erro de driver.
  if (!z.uuid().safeParse(id).success) {
    return fallback
  }
  const perfil = await getCompetitorProfile(id)
  return perfil ? { title: `${perfil.nome} · Goliseu` } : fallback
}

export default async function CompetidorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02.
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }

  // O fetcher já aplica o gate (pirâmide ativa OU dono) e espelha a RLS. Negado
  // ou inexistente → null → 404, sem oráculo de existência.
  const perfil = await getCompetitorProfile(id)
  if (!perfil) {
    notFound()
  }

  // Artilheiros da carreira (change add-artilharia): mesmo competitor_id do
  // perfil. Degrada para `[]` (a carreira é secundária) — RLS filtra visibilidade.
  const supabase = await createClient()
  // Artilheiros + insights (forma/destaques) + rivais do picker de confronto, em
  // paralelo. Todos degradam sozinhos (secundários); a RLS filtra a visibilidade.
  const [artilheiros, insights, rivais, conquistas, tecnicos] = await Promise.all([
    getArtilheirosDoCompetidor(supabase, { competitorId: id }),
    getCompetidorInsights(supabase, { competitorId: id }),
    getRivaisDoCompetidor(supabase, { competitorId: id }),
    getConquistasDoCompetidor(supabase, { competitorId: id }),
    getTecnicosDoCompetidor(supabase, { competitorId: id }),
  ])

  const semTemporadas = perfil.historico.length === 0

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 rounded-full"
        >
          <Link
            href={
              perfil.seasonAtualId
                ? `/dashboard/ligas/${perfil.seasonAtualId}`
                : "/dashboard/ligas"
            }
            // Sem prefetch: back-link "Voltar à pirâmide" (rota RSC cara). Evita
            // somar à rajada que a borda da Vercel descarta (503). O clique
            // navega. Ver change add-header-prefetch-hardening.
            prefetch={false}
          >
            <ArrowLeft aria-hidden="true" />
            Voltar à pirâmide
          </Link>
        </Button>
      </div>

      <CompetidorHero perfil={perfil} />

      {/* Forma + destaques de carreira e painel de confronto (change
          add-insights-classificacao). Derivam das PARTIDAS, não das temporadas
          consolidadas — aparecem mesmo sem temporada encerrada. Cada um se
          auto-oculta quando não há dado (sem jogo / sem rival). */}
      <CompetidorForma insights={insights} />
      <ConfrontoDiretoPanel
        competitorId={perfil.id}
        competitorNome={perfil.nome}
        competitorEscudoUrl={perfil.escudoUrl}
        rivais={rivais}
      />

      {/* Técnicos que comandaram o clube (change add-tecnicos-historico). Deriva
          das tenures (materializadas com os slots) — aparece mesmo antes de
          qualquer temporada encerrar. Auto-oculta sem passagens. */}
      <CompetidorTecnicos temporadas={tecnicos} />

      {/* Artilheiros com temporada encerrada moram junto dos agregados (abaixo).
          Caso-borda: gols numa temporada em andamento, sem nenhuma encerrada — a
          seção sobe pra cá para não sumir sob o estado vazio de "sem temporadas". */}
      {semTemporadas && artilheiros.length > 0 ? (
        <CompetidorArtilheiros artilheiros={artilheiros} />
      ) : null}

      {semTemporadas ? (
        // Estado vazio: o competidor existe mas não tem temporada consolidada
        // (entrou agora, ou nenhuma temporada encerrou ainda).
        <Card className="elevate animate-rise flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="bg-muted/40 text-muted-foreground flex size-14 items-center justify-center rounded-2xl"
          >
            <CalendarOff className="size-6" />
          </span>
          <CardContent className="flex max-w-sm flex-col gap-1.5 p-0">
            <h2 className="font-display text-lg font-bold">
              Ainda sem temporadas encerradas
            </h2>
            <p className="text-muted-foreground text-sm">
              Quando uma temporada da pirâmide for encerrada, o histórico, o
              promédio e as conquistas deste competidor aparecem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <CompetidorAgregados perfil={perfil} />
          <CompetidorConquistas perfil={perfil} />
          <CompetidorHallDaFama temporadas={conquistas} />
          <CompetidorArtilheiros artilheiros={artilheiros} />
          <PromedioEvolucao historico={perfil.historico} />
          <TemporadaTimeline historico={perfil.historico} />
        </>
      )}
    </main>
  )
}
