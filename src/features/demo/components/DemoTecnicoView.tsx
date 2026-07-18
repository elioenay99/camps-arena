"use client"

import Link from "next/link"
import { Users } from "lucide-react"

import { FormaBadges } from "@/features/standings/components/FormaBadges"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { DemoConfrontoDiretoPanel } from "@/features/demo/adapters/DemoConfrontoDiretoPanel"
import { derivarClassificacao } from "@/features/demo/derive/derivarClassificacao"
import { useDemoStore, useTorneio } from "@/features/demo/store/useDemoStore"

const LIGA_ID = "demo-liga"

/**
 * Perfil do técnico (read-only) + confronto direto interativo. O técnico é
 * derivado do clube que comanda (ident.tecnico); a campanha e o confronto reusam
 * as partidas do clube na liga, via motor puro.
 */
export function DemoTecnicoView({ id }: { id: string }) {
  const { state } = useDemoStore()
  const liga = useTorneio(LIGA_ID)
  const ident = state.identidades[id]

  if (!liga || !ident || !ident.ehCompetitivo || !ident.tecnico) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        Técnico não encontrado nesta demonstração.{" "}
        <Link href="/demo/ligas" className="text-primary hover:underline">
          Ver pirâmides
        </Link>
      </div>
    )
  }

  const { linhas, formaPorParticipante } = derivarClassificacao(liga, state.identidades)
  const linha = linhas.find((l) => l.participanteId === id)
  const forma = formaPorParticipante.get(id) ?? []
  const naLiga = liga.participantes.includes(id)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col">
          <h1 className="font-display text-xl font-bold">{ident.tecnico}</h1>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            comanda
            <TeamCrest nome={ident.nome} escudoUrl={ident.escudoUrl} size={16} />
            {ident.nome}
          </span>
        </div>
      </div>

      {linha ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {[
            { r: "Posição", v: `${linha.posicao}º` },
            { r: "Pontos", v: linha.pontos },
            { r: "Jogos", v: linha.jogos },
            { r: "Vitórias", v: linha.vitorias },
            { r: "Saldo", v: linha.saldo },
          ].map((c) => (
            <div
              key={c.r}
              className="flex flex-col items-center rounded-lg border bg-card/60 px-2 py-2"
            >
              <span className="font-display text-lg tabular-nums">{c.v}</span>
              <span className="text-xs text-muted-foreground">{c.r}</span>
            </div>
          ))}
        </div>
      ) : null}

      {forma.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Forma recente</h2>
          <FormaBadges itens={forma.slice(-5)} />
        </section>
      ) : null}

      {naLiga ? (
        <DemoConfrontoDiretoPanel
          atualId={id}
          candidatos={liga.participantes}
          identidades={state.identidades}
          partidas={liga.partidas}
          rotuloCandidato="técnico adversário"
        />
      ) : null}
    </div>
  )
}
