"use client"

import Link from "next/link"

import { FormaBadges } from "@/features/standings/components/FormaBadges"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { DemoConfrontoDiretoPanel } from "@/features/demo/adapters/DemoConfrontoDiretoPanel"
import { derivarClassificacao } from "@/features/demo/derive/derivarClassificacao"
import { useDemoStore, useTorneio } from "@/features/demo/store/useDemoStore"

const LIGA_ID = "demo-liga"

export function DemoCompetidorView({ id }: { id: string }) {
  const { state } = useDemoStore()
  const liga = useTorneio(LIGA_ID)
  const ident = state.identidades[id]

  if (!liga || !ident || !liga.participantes.includes(id)) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        Competidor não encontrado nesta demonstração.{" "}
        <Link href="/demo/torneios/demo-liga" className="text-primary hover:underline">
          Voltar ao torneio
        </Link>
      </div>
    )
  }

  const { linhas, formaPorParticipante } = derivarClassificacao(liga, state.identidades)
  const linha = linhas.find((l) => l.participanteId === id)
  const forma = formaPorParticipante.get(id) ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {ident.ehCompetitivo ? (
          <TeamCrest nome={ident.nome} escudoUrl={ident.escudoUrl} size={44} />
        ) : (
          <UserAvatar nome={ident.nome} avatarUrl={ident.avatarUrl} size={44} />
        )}
        <div className="flex flex-col">
          <h1 className="font-display text-xl font-bold">{ident.nome}</h1>
          <span className="text-xs text-muted-foreground">
            {ident.ehCompetitivo ? "Clube" : "Competidor por nome"}
            {ident.tecnico ? ` · téc. ${ident.tecnico}` : ""}
          </span>
        </div>
      </div>

      {linha ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            { r: "Posição", v: `${linha.posicao}º` },
            { r: "Pontos", v: linha.pontos },
            { r: "Jogos", v: linha.jogos },
            { r: "Vitórias", v: linha.vitorias },
            { r: "Saldo", v: linha.saldo },
            { r: "Gols pró", v: linha.golsPro },
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

      <DemoConfrontoDiretoPanel
        atualId={id}
        candidatos={liga.participantes}
        identidades={state.identidades}
        partidas={liga.partidas}
        rotuloCandidato="rival"
      />
    </div>
  )
}
