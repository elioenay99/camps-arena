import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronRight, Layers, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Termo } from "@/features/glossario/Termo"
import { SeasonStatusPill } from "@/features/league/components/SeasonStatusPill"
import {
  getCompetitions,
  type PiramideResumo,
} from "@/features/league/data/getCompetitions"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Pirâmides · Goliseu",
}

/** Plural simples pt-BR para a contagem de divisões. */
function rotuloDivisoes(n: number): string {
  return n === 1 ? "1 divisão" : `${n} divisões`
}

function ListaPiramides({ piramides }: { piramides: PiramideResumo[] }) {
  return (
    <ul className="grid list-none gap-2.5 p-0">
      {piramides.map((p, i) => {
        // Sem temporada montada ainda → cai na própria pirâmide pela temporada
        // corrente (sempre há a temporada 1 em rascunho após criar).
        const href = p.seasonAtualId
          ? `/dashboard/ligas/${p.seasonAtualId}`
          : `/dashboard/ligas`
        return (
          <li
            key={p.id}
            className="animate-rise"
            style={{ "--stagger": `${i * 45}ms` } as React.CSSProperties}
          >
            {/* Sem prefetch: a lista prefetcharia N rotas ligas/[id] (RSC
                caras) de uma vez; a rajada estourava a borda da Vercel (503).
                Ver add-dashboard-prefetch-hardening. */}
            <Link
              href={href}
              prefetch={false}
              className="elevate-hover group flex items-center gap-3.5 rounded-xl border bg-card/80 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
              >
                <Layers className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {p.nome.trim() || "Pirâmide"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {rotuloDivisoes(p.numDivisoes)}
                  {p.temporadaAtual != null
                    ? ` · Temporada ${p.temporadaAtual}`
                    : ""}
                </span>
              </span>
              {p.statusTemporada ? (
                <SeasonStatusPill status={p.statusTemporada} />
              ) : null}
              <ChevronRight
                aria-hidden="true"
                className="text-muted-foreground/40 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Estado vazio convidativo do índice de pirâmides. */
function SemPiramides() {
  return (
    <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="glow-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Layers className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <div className="flex items-center justify-center gap-0.5">
          <h2 className="font-display text-xl font-bold">Sua primeira pirâmide</h2>
          <Termo id="piramide" />
        </div>
        <p className="text-muted-foreground text-sm">
          Empilhe divisões com acesso e queda. A pirâmide é imortal — temporada
          após temporada, os clubes sobem e caem.
        </p>
      </div>
      <Button asChild className="rounded-full">
        <Link href="/dashboard/ligas/nova">
          <Plus aria-hidden="true" />
          Nova pirâmide
        </Link>
      </Button>
    </Card>
  )
}

/**
 * Índice de pirâmides de liga do dono. Cada card resume a pirâmide (nome, nº de
 * divisões, temporada e status correntes) e leva à temporada vigente.
 */
export default async function LigasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard/ligas")
  }

  const piramides = await getCompetitions(user.id)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Pirâmides
          </h1>
          <p className="text-muted-foreground text-sm">
            Suas ligas com divisões, acesso e queda entre temporadas.
          </p>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link href="/dashboard/ligas/nova">
            <Plus aria-hidden="true" />
            Nova pirâmide
          </Link>
        </Button>
      </header>

      {piramides.length === 0 ? (
        <SemPiramides />
      ) : (
        <ListaPiramides piramides={piramides} />
      )}
    </main>
  )
}
