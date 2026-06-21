import { ArrowLeft, Layers, Palette } from "lucide-react"
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
import { getSeason } from "@/features/league/data/getSeason"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Cores da liga · Goliseu",
}

export default async function CoresDaLigaPage({
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
    redirect(`/login?redirectTo=/dashboard/ligas/${id}/cores`)
  }

  // Editar a identidade é capacidade GERIR (dono ou admin da equipe). getSeason
  // já gateia internamente por `podeGerir({ competitionId })` — sem capacidade
  // (ou inexistente) → null → 404 (sem oráculo). A action revalida a posse.
  const temporada = await getSeason(id, user.id)
  if (!temporada) {
    notFound()
  }

  const competitionId = temporada.competicao.id
  const nomePiramide = temporada.competicao.nome.trim() || "Pirâmide"

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2 w-fit rounded-full"
      >
        <Link href={`/dashboard/ligas/${id}`}>
          <ArrowLeft aria-hidden="true" />
          Voltar à temporada
        </Link>
      </Button>

      {/* Cor DEFAULT da pirâmide: identidade herdada pelas divisões sem cor
          própria + header/seções cross-divisão. */}
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
                Identidade da pirâmide
              </CardTitle>
              <CardDescription className="truncate">
                {nomePiramide}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChampionshipColorsForm
            primariaInicial={temporada.competicao.corPrimaria ?? ""}
            secundariaInicial={temporada.competicao.corSecundaria ?? ""}
            alvoLabel={nomePiramide}
            alvo={{ tipo: "piramide", competitionId }}
          />
        </CardContent>
      </Card>

      {/* Cor PRÓPRIA de cada divisão: vazia herda a cor da pirâmide acima. */}
      <section aria-labelledby="divisoes-cores" className="flex flex-col gap-4">
        <h2
          id="divisoes-cores"
          className="text-muted-foreground flex items-center gap-2 border-t pt-6 text-xs font-semibold tracking-wide uppercase"
        >
          <Layers className="size-3.5" aria-hidden="true" />
          Cores por divisão
        </h2>
        {temporada.divisoes.map((div) => {
          const nomeDiv = div.nome.trim() || `Divisão ${div.nivel}`
          return (
            <Card key={div.id} className="elevate" size="sm">
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sm font-bold tabular-nums"
                  >
                    {div.nivel}
                  </span>
                  <CardTitle className="font-display text-base">
                    {nomeDiv}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ChampionshipColorsForm
                  primariaInicial={div.corPrimaria ?? ""}
                  secundariaInicial={div.corSecundaria ?? ""}
                  alvoLabel={nomeDiv}
                  alvo={{ tipo: "divisao", divisionSeasonId: div.id }}
                />
              </CardContent>
            </Card>
          )
        })}
      </section>
    </main>
  )
}
