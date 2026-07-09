import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, UserX } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { getTecnicoProfile } from "@/features/league/data/getTecnicoProfile"
import { getConquistasDoTecnico } from "@/features/league/data/getConquistasDoTecnico"
import { getTecnicoCampanha } from "@/features/league/data/getTecnicoCampanha"
import { TecnicoHero } from "@/features/league/components/tecnico/TecnicoHero"
import { CampanhaDeSempre } from "@/features/league/components/tecnico/CampanhaDeSempre"
import { ClubesComandados } from "@/features/league/components/tecnico/ClubesComandados"
import { ConfrontoTecnicosPanel } from "@/features/league/components/tecnico/ConfrontoTecnicosPanel"
import { CompetidorHallDaFama } from "@/features/league/components/competidor/CompetidorHallDaFama"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>
}): Promise<Metadata> {
  const { userId } = await params
  const fallback = { title: "Técnico · Goliseu" }
  if (!z.uuid().safeParse(userId).success) {
    return fallback
  }
  const supabase = await createClient()
  const perfil = await getTecnicoProfile(supabase, { userId })
  return perfil ? { title: `${perfil.nome} · Técnico · Goliseu` } : fallback
}

export default async function TecnicoPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02.
  if (!z.uuid().safeParse(userId).success) {
    notFound()
  }

  const supabase = await createClient()
  // O fetcher já gateia por visibilidade (identidade em `users`, tenures pela RLS
  // de `coach_tenures`). Usuário inexistente/ilegível → null → 404.
  const perfil = await getTecnicoProfile(supabase, { userId })
  if (!perfil) {
    notFound()
  }

  // Prêmios herdados (tenures vigentes × conquistas, com o dedup do split).
  // Degrada para [] — a estante é secundária.
  const conquistas = await getConquistasDoTecnico(supabase, { userId })

  // Campanha PESSOAL por janela de comando (números de sempre + fatia por clube +
  // adversários). Degrada para vazio em erro de IO.
  const campanha = await getTecnicoCampanha(supabase, { userId })

  const semHistorico = perfil.clubes.length === 0

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 rounded-full"
        >
          <Link href="/dashboard/ligas" prefetch={false}>
            <ArrowLeft aria-hidden="true" />
            Voltar às ligas
          </Link>
        </Button>
      </div>

      <TecnicoHero perfil={perfil} />

      {semHistorico ? (
        <Card className="elevate animate-rise flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="bg-muted/40 text-muted-foreground flex size-14 items-center justify-center rounded-2xl"
          >
            <UserX className="size-6" />
          </span>
          <CardContent className="flex max-w-sm flex-col gap-1.5 p-0">
            <h2 className="font-display text-lg font-bold">
              Sem histórico visível em ligas
            </h2>
            <p className="text-muted-foreground text-sm">
              Quando este técnico comandar um clube numa pirâmide visível para
              você, os clubes e os troféus herdados aparecem aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <CampanhaDeSempre total={campanha.total} />
          <ClubesComandados clubes={perfil.clubes} porClube={campanha.porClube} />
          <ConfrontoTecnicosPanel
            userId={perfil.id}
            nome={perfil.nome}
            avatar={perfil.avatar}
            adversarios={campanha.adversarios}
          />
          <CompetidorHallDaFama temporadas={conquistas} />
        </>
      )}
    </main>
  )
}
