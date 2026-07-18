"use client"

import { BarChart3, ListOrdered, Network, Swords } from "lucide-react"

import { BracketView } from "@/features/knockout/components/BracketView"
import { ArtilhariaRanking } from "@/features/league/components/ArtilhariaRanking"
import { MuralhaRanking } from "@/features/league/components/MuralhaRanking"
import { ClassificacaoResponsiva } from "@/features/standings/components/ClassificacaoResponsiva"
import { DestaquesClassificacao } from "@/features/standings/components/DestaquesClassificacao"
import { StandingsTable } from "@/features/standings/components/StandingsTable"
import { ordenarCronologico } from "@/features/standings/insights"
import { StatusPill } from "@/features/tournament/components/StatusPill"
import { FORMATO_META } from "@/features/tournament/formatoMeta"
import { TournamentTabs, type AbaTorneio } from "@/features/tournament/components/TournamentTabs"

import { DemoMatchCard } from "@/features/demo/adapters/DemoMatchCard"
import { derivarArtilharia } from "@/features/demo/derive/derivarArtilharia"
import { derivarClassificacao } from "@/features/demo/derive/derivarClassificacao"
import { useDemoStore, useTorneio } from "@/features/demo/store/useDemoStore"

import { IndicadoresTorneio } from "./IndicadoresTorneio"

export function DemoTorneioView({ id }: { id: string }) {
  const { state } = useDemoStore()
  const torneio = useTorneio(id)

  if (!torneio) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        Torneio não encontrado nesta demonstração.
      </div>
    )
  }

  const meta = FORMATO_META[torneio.formato]
  const ehMataMata = torneio.formato === "mata_mata"
  const temLiga = torneio.partidas.length > 0
  const { linhas, destaques, nomePorId, formaPorParticipante, muralha } =
    derivarClassificacao(torneio, state.identidades)
  const artilharia = derivarArtilharia(torneio, state.identidades)

  const abas: AbaTorneio[] = []

  if (temLiga) {
    abas.push({
      value: "classificacao",
      label: "Classificação",
      labelCurto: "Class.",
      icon: <ListOrdered aria-hidden className="size-4" />,
      content: (
        <div className="flex flex-col gap-6">
          <DestaquesClassificacao destaques={destaques} nomePorId={nomePorId} />
          <ClassificacaoResponsiva>
            <StandingsTable
              linhas={linhas}
              rotuloLado="Competidor"
              formaPorParticipante={formaPorParticipante}
              hrefCompetidorBase="/demo/ligas/competidor"
              expansivel
            />
          </ClassificacaoResponsiva>
        </div>
      ),
    })
  }

  if (ehMataMata && torneio.chave.length > 0) {
    abas.push({
      value: "chave",
      label: "Chave",
      icon: <Network aria-hidden className="size-4" />,
      content: (
        <BracketView
          partidas={torneio.chave}
          terceiroLugar={torneio.terceiroLugar}
          cor={torneio.corPrimaria}
          celebrarCampeao
        />
      ),
    })
  }

  if (temLiga) {
    const partidas = [...torneio.partidas].sort(ordenarCronologico)
    abas.push({
      value: "partidas",
      label: "Partidas",
      icon: <Swords aria-hidden className="size-4" />,
      content: (
        <div className="grid gap-3 sm:grid-cols-2">
          {partidas.map((p) => (
            <DemoMatchCard key={p.id} torneio={torneio} partida={p} />
          ))}
        </div>
      ),
    })
  }

  abas.push({
    value: "numeros",
    label: "Números",
    icon: <BarChart3 aria-hidden className="size-4" />,
    content: (
      <div className="flex flex-col gap-6">
        <IndicadoresTorneio
          linhas={linhas}
          artilharia={artilharia}
          partidas={torneio.partidas}
        />
        {artilharia.length > 0 || muralha.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <section aria-labelledby="art-titulo" className="flex flex-col gap-3">
              <h3 id="art-titulo" className="text-sm font-semibold">
                Artilharia
              </h3>
              <ArtilhariaRanking
                linhas={artilharia}
                hrefCompetidorBase="/demo/ligas/competidor"
              />
            </section>
            <section aria-labelledby="mur-titulo" className="flex flex-col gap-3">
              <h3 id="mur-titulo" className="text-sm font-semibold">
                Muralha (defesas)
              </h3>
              <MuralhaRanking
                linhas={muralha}
                hrefCompetidorBase="/demo/ligas/competidor"
              />
            </section>
          </div>
        ) : null}
      </div>
    ),
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">{torneio.nome}</h1>
        <StatusPill status={torneio.status} />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <meta.Icon aria-hidden className="size-3.5" />
          {meta.label}
        </span>
      </div>
      {torneio.aviso ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
        >
          {torneio.aviso}
        </div>
      ) : null}
      {abas.length > 0 ? (
        <TournamentTabs abas={abas} padrao={abas[0].value} />
      ) : (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          Este torneio ainda não tem partidas nesta demonstração.
        </div>
      )}
    </div>
  )
}
