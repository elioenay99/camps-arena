import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronRight, Plus, Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { champThemeProps } from "@/features/championship/championshipTheme"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { CupSeasonStatusPill } from "@/features/cup/components/CupSeasonStatusPill"
import { CUP_FORMAT_LABEL, CUP_SCOPE_LABEL } from "@/features/cup/cupLabels"
import { getCups, type CopaResumo } from "@/features/cup/data/getCups"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Copas · Goliseu",
}

function CartaoCopa({ copa, i }: { copa: CopaResumo; i: number }) {
  const themeProps = champThemeProps(copa.corPrimaria, copa.corSecundaria)
  return (
    <li
      className="animate-rise"
      style={{ "--stagger": `${i * 45}ms` } as React.CSSProperties}
    >
      {/* Sem prefetch: a lista prefetcharia N rotas copas/[id] (RSC caras) de
          uma vez; a rajada estourava a borda da Vercel (503). Ver
          add-dashboard-prefetch-hardening. */}
      <Link
        href={`/dashboard/copas/${copa.id}`}
        prefetch={false}
        className={`elevate-hover group flex items-center gap-3.5 rounded-xl border bg-card/80 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${themeProps?.className ?? ""}`}
        style={themeProps?.style}
      >
        <ChampionshipBadge
          icon={<Trophy className="size-5" />}
          primary={copa.corPrimaria}
          secondary={copa.corSecundaria}
          className="size-10 rounded-lg ring-1 ring-primary/15"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{copa.nome.trim() || "Copa"}</span>
          <span className="text-muted-foreground text-xs">
            {CUP_SCOPE_LABEL[copa.abrangencia]} · {CUP_FORMAT_LABEL[copa.formato]}
            {copa.edicaoAtual != null ? ` · Edição ${copa.edicaoAtual}` : ""}
          </span>
        </span>
        {copa.statusEdicao ? <CupSeasonStatusPill status={copa.statusEdicao} /> : null}
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground/40 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        />
      </Link>
    </li>
  )
}

function SemCopas() {
  return (
    <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="glow-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Trophy className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold">Sua primeira copa</h2>
        <p className="text-muted-foreground text-sm">
          Copas nacionais e continentais alimentadas pela classificação das suas ligas
          e copas. A copa é imortal — edição após edição.
        </p>
      </div>
      <Button asChild className="rounded-full">
        <Link href="/dashboard/copas/nova">
          <Plus aria-hidden="true" />
          Nova copa
        </Link>
      </Button>
    </Card>
  )
}

/**
 * Índice de copas do dono. Separa ativas e arquivadas; cada card resume a copa
 * (nome, abrangência, formato, edição corrente + status) e leva à página da copa.
 */
export default async function CopasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirectTo=/dashboard/copas")
  }

  const copas = await getCups(user.id)
  const ativas = copas.filter((c) => c.status === "ativa")
  const arquivadas = copas.filter((c) => c.status === "arquivada")

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">Copas</h1>
          <p className="text-muted-foreground text-sm">
            Mata-mata e grupos alimentados pela classificação das suas ligas e copas.
          </p>
        </div>
        <Button asChild size="sm" className="rounded-full">
          <Link href="/dashboard/copas/nova">
            <Plus aria-hidden="true" />
            Nova copa
          </Link>
        </Button>
      </header>

      {copas.length === 0 ? (
        <SemCopas />
      ) : (
        <div className="flex flex-col gap-6">
          {ativas.length > 0 ? (
            <ul className="grid list-none gap-2.5 p-0">
              {ativas.map((c, i) => (
                <CartaoCopa key={c.id} copa={c} i={i} />
              ))}
            </ul>
          ) : null}

          {arquivadas.length > 0 ? (
            <section aria-labelledby="arquivadas-titulo" className="flex flex-col gap-2.5">
              <h2
                id="arquivadas-titulo"
                className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Arquivadas
              </h2>
              <ul className="grid list-none gap-2.5 p-0">
                {arquivadas.map((c, i) => (
                  <CartaoCopa key={c.id} copa={c} i={i} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </main>
  )
}
