import { ArrowLeft, Layers, Palette, Shield } from "lucide-react"
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
import { CompetitorCrestForm } from "@/features/league/components/CompetitorCrestForm"
import { getSeason } from "@/features/league/data/getSeason"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Identidade da liga · Goliseu",
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
  // NÃO gateia mais por capacidade (serve leitura a qualquer logado —
  // add-liga-visao-leitura): `null` só quando inexistente/invisível (RLS). O gate
  // de GESTÃO é AQUI: `!podeGerir → 404` (mesma resposta, sem oráculo). A action
  // revalida a posse.
  const temporada = await getSeason(id, user.id)
  if (!temporada || !temporada.podeGerir) {
    notFound()
  }

  const competitionId = temporada.competicao.id
  // Competidores da PIRÂMIDE (todas as divisões), em ordem alfabética estável.
  const competidores = Object.values(temporada.competidores).sort((a, b) =>
    a.nome.localeCompare(b.nome)
  )
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

      {/* Escudo PERSONALIZADO por liga (change escudo-personalizado-liga). Fica
          aqui, e não em rota nova: esta é a tela que o header da liga já chama de
          "Identidade". O gate de GESTÃO da página vale para a seção inteira; a
          action revalida a posse. */}
      <section aria-labelledby="escudos-clubes" className="flex flex-col gap-4">
        <h2
          id="escudos-clubes"
          className="text-muted-foreground flex items-center gap-2 border-t pt-6 text-xs font-semibold tracking-wide uppercase"
        >
          <Shield className="size-3.5" aria-hidden="true" />
          Escudos dos clubes
        </h2>
        <p className="text-muted-foreground text-sm">
          O escudo trocado aqui vale só nesta pirâmide — o catálogo e as outras
          ligas continuam com o escudo original.
        </p>
        {competidores.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum competidor cadastrado ainda.
          </p>
        ) : (
          <Card className="elevate" size="sm">
            <CardContent className="flex flex-col divide-y">
              {competidores.map((c) => (
                <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <CompetitorCrestForm
                    competitorId={c.id}
                    seasonId={id}
                    nome={c.nome}
                    escudoUrl={c.escudoUrl}
                    temEscudoProprio={c.temEscudoProprio}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </main>
  )
}
