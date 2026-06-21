import { ArrowLeft, Palette } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChampionshipColorsForm } from "@/features/championship/components/ChampionshipColorsForm"
import { podeGerir } from "@/lib/autorizacao"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Cores do torneio · Goliseu",
}

export default async function CoresDoTorneioPage({
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
    redirect(`/login?redirectTo=/dashboard/torneios/${id}/cores`)
  }

  // Editar a identidade é capacidade GERIR (dono ou admin da equipe). Carrega o
  // torneio sem filtrar por posse e gateia por capacidade. Inexistente/alheio
  // ou sem capacidade → o MESMO 404 (sem oráculo). A autorização real é a
  // action + RLS.
  const { data: torneio, error } = await supabase
    .from("tournaments")
    .select("id, titulo, cor_primaria, cor_secundaria")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    throw new Error(`Falha ao carregar o torneio: ${error.message}`)
  }
  if (!torneio || !(await podeGerir(supabase, { tournamentId: id }))) {
    notFound()
  }

  const titulo = torneio.titulo.trim() || "Torneio"

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2 w-fit rounded-full"
      >
        <Link href={`/dashboard/torneios/${id}`}>
          <ArrowLeft aria-hidden="true" />
          Voltar ao torneio
        </Link>
      </Button>

      <Card className="elevate">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="bg-primary/10 text-primary ring-primary/20 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1"
            >
              <Palette className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <CardTitle className="font-display text-xl">
                Cores do torneio
              </CardTitle>
              <CardDescription className="truncate">{titulo}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChampionshipColorsForm
            primariaInicial={torneio.cor_primaria ?? ""}
            secundariaInicial={torneio.cor_secundaria ?? ""}
            alvoLabel={titulo}
            alvo={{ tipo: "torneio", tournamentId: id }}
          />
        </CardContent>
      </Card>
    </main>
  )
}
