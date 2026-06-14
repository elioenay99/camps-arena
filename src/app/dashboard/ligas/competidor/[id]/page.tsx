import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarOff } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getCompetitorProfile } from "@/features/league/data/getCompetitorProfile"
import { CompetidorHero } from "@/features/league/components/competidor/CompetidorHero"
import { CompetidorAgregados } from "@/features/league/components/competidor/CompetidorAgregados"
import { CompetidorConquistas } from "@/features/league/components/competidor/CompetidorConquistas"
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
          >
            <ArrowLeft aria-hidden="true" />
            Voltar à pirâmide
          </Link>
        </Button>
      </div>

      <CompetidorHero perfil={perfil} />

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
          <PromedioEvolucao historico={perfil.historico} />
          <TemporadaTimeline historico={perfil.historico} />
        </>
      )}
    </main>
  )
}
