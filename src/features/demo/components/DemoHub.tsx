"use client"

import { useState } from "react"
import Link from "next/link"
import { Activity, ListChecks, Trophy, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PartidaCronologica } from "@/features/standings/insights"
import { DemoMatchCard } from "@/features/demo/adapters/DemoMatchCard"
import { useDemoStore } from "@/features/demo/store/useDemoStore"
import type { TorneioDemo } from "@/features/demo/store/tipos"

function Indicador({
  icon,
  rotulo,
  valor,
}: {
  icon: React.ReactNode
  rotulo: string
  valor: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-3">
      <span aria-hidden className="text-primary/70">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-xl leading-none tabular-nums">{valor}</span>
        <span className="truncate text-xs text-muted-foreground">{rotulo}</span>
      </span>
    </div>
  )
}

export function DemoHub() {
  const { state } = useDemoStore()
  const [mostrarPartidas, setMostrarPartidas] = useState(true)

  // Partidas ativas derivadas do estado (em andamento em qualquer torneio).
  const ativas: { torneio: TorneioDemo; partida: PartidaCronologica }[] = state.torneios
    .flatMap((t) => t.partidas.map((p) => ({ torneio: t, partida: p })))
    .filter((x) => x.partida.status === "em_andamento")
    .slice(0, 6)

  const totalGols = state.torneios.reduce(
    (acc, t) => acc + t.gols.filter((g) => !g.contra).reduce((s, g) => s + g.gols, 0),
    0
  )
  const totalEncerradas = state.torneios.reduce(
    (acc, t) => acc + t.partidas.filter((p) => p.status === "encerrada").length,
    0
  )
  const partidasVisiveis = mostrarPartidas ? ativas : []

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-primary/80">
          Modo demonstração
        </p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Sinta o Goliseu por dentro
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Edite um placar e veja a classificação, a forma, os destaques, a Muralha e a
          artilharia recomputarem ao vivo. Tudo aqui é fictício — nada é enviado ao
          sistema real.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/demo/torneios/demo-liga">Ver o torneio ao vivo</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/cadastro">Criar conta</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="indicadores-titulo" className="flex flex-col gap-3">
        <h2 id="indicadores-titulo" className="text-sm font-semibold">
          Indicadores
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Indicador icon={<Trophy className="size-5" />} rotulo="Competições" valor={String(state.torneios.length)} />
          <Indicador icon={<Users className="size-5" />} rotulo="Competidores" valor={String(Object.keys(state.identidades).length)} />
          <Indicador icon={<ListChecks className="size-5" />} rotulo="Partidas encerradas" valor={String(totalEncerradas)} />
          <Indicador icon={<Activity className="size-5" />} rotulo="Gols marcados" valor={String(totalGols)} />
        </div>
      </section>

      <section aria-labelledby="ativas-titulo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="ativas-titulo" className="text-sm font-semibold">
            Partidas em andamento
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMostrarPartidas((v) => !v)}
            aria-pressed={!mostrarPartidas}
          >
            {mostrarPartidas ? "Simular sem partidas" : "Mostrar partidas"}
          </Button>
        </div>
        {partidasVisiveis.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {partidasVisiveis.map(({ torneio, partida }) => (
              <DemoMatchCard key={partida.id} torneio={torneio} partida={partida} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma partida em andamento agora.
          </div>
        )}
      </section>
    </div>
  )
}
