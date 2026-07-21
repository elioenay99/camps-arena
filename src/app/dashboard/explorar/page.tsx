import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronRight, Compass, Layers } from "lucide-react"

import { Card } from "@/components/ui/card"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { SeasonStatusPill } from "@/features/league/components/SeasonStatusPill"
import { StatusPill } from "@/features/tournament/components/StatusPill"
import { FORMATO_META } from "@/features/tournament/formatoMeta"
import { getVitrine, type ItemVitrine } from "@/features/discovery/data/getVitrine"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Explorar · Goliseu",
}

function CardVitrine({ item }: { item: ItemVitrine }) {
  const Icone = item.tipo === "liga" ? Layers : FORMATO_META[item.formato].Icon
  const legenda =
    item.tipo === "liga" ? "Liga de divisões" : FORMATO_META[item.formato].label
  // Sem prefetch: a vitrine é a lista mais longa e aponta pra ligas/[id] E
  // torneios/[id] (RSC caras); a rajada de prefetches estourava a borda da
  // Vercel (503). Ver add-dashboard-prefetch-hardening.
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="elevate-hover group flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-xl border bg-card/80 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <ChampionshipBadge
        icon={<Icone className="size-5" aria-hidden="true" />}
        primary={item.corPrimaria}
        secondary={item.corSecundaria}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{item.titulo}</span>
        <span className="text-muted-foreground truncate text-xs">
          {legenda}
          {item.dono ? ` · por ${item.dono}` : ""}
        </span>
      </span>
      {/* A pílula desce para uma faixa própria no mobile (recuada sob o nome).
          Disputando a linha com badge e chevron ela deixava ~120px para o
          título e cortava o "por Fulano" — o único desempate entre competições
          homônimas, nesta que é a tela de RECONHECER competições. */}
      <span className="order-last basis-full pl-[3.375rem] sm:order-none sm:basis-auto sm:pl-0">
        {item.tipo === "liga" ? (
          <SeasonStatusPill status={item.status} />
        ) : (
          <StatusPill status={item.status} />
        )}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="text-muted-foreground/40 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </Link>
  )
}

/** Estado vazio da vitrine. */
function VitrineVazia() {
  return (
    <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="glow-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Compass className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold">Nenhuma competição pública ainda</h2>
        <p className="text-muted-foreground text-sm">
          Quando um organizador listar uma pirâmide ou torneio na vitrine, ele
          aparece aqui para todo mundo descobrir.
        </p>
      </div>
    </Card>
  )
}

/**
 * Vitrine pública (change add-vitrine-publica-e-compartilhar): lista as
 * competições que os organizadores optaram por publicar. Exige sessão (como o
 * resto do dashboard); a visibilidade das linhas é da RLS.
 */
export default async function ExplorarPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirectTo=/dashboard/explorar")
  }

  const itens = await getVitrine()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Explorar</h1>
        <p className="text-muted-foreground text-sm">
          Pirâmides e torneios públicos da comunidade.
        </p>
      </header>

      {itens.length === 0 ? (
        <VitrineVazia />
      ) : (
        <ul className="grid list-none gap-2.5 p-0">
          {itens.map((item, i) => (
            <li
              key={`${item.tipo}-${item.id}`}
              className="animate-rise"
              style={{ "--stagger": `${i * 45}ms` } as React.CSSProperties}
            >
              <CardVitrine item={item} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
