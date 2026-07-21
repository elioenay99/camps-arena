"use client"

import * as React from "react"

import { SelectNative } from "@/components/ui/select-native"

import type { PartidaCronologica } from "@/features/standings/insights"
import { confrontoDireto } from "@/features/standings/insights"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type { IdentidadeDemo } from "@/features/demo/store/tipos"

// Confronto direto interativo — o picker chama `confrontoDireto()` PURO sobre os
// fixtures, no lugar da server action. `ConfrontoResultado` (inline/não exportado
// no produto) é reimplementado aqui.

function Identidade({ ident }: { ident: IdentidadeDemo | undefined }) {
  const nome = ident?.nome ?? "—"
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {ident && !ident.ehCompetitivo ? (
        <UserAvatar nome={nome} avatarUrl={ident.avatarUrl} size={20} />
      ) : (
        <TeamCrest nome={nome} escudoUrl={ident?.escudoUrl ?? null} size={20} />
      )}
      <span className="truncate">{nome}</span>
    </span>
  )
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border bg-card/60 px-3 py-2">
      <span className="font-display text-lg tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
    </div>
  )
}

export function DemoConfrontoDiretoPanel({
  atualId,
  candidatos,
  identidades,
  partidas,
  rotuloCandidato = "adversário",
}: {
  atualId: string
  candidatos: string[]
  identidades: Record<string, IdentidadeDemo>
  partidas: PartidaCronologica[]
  rotuloCandidato?: string
}) {
  const outros = candidatos.filter((id) => id !== atualId)
  const [rivalId, setRivalId] = React.useState<string>(outros[0] ?? "")

  const confronto = React.useMemo(
    () => (rivalId ? confrontoDireto(atualId, rivalId, partidas) : null),
    [atualId, rivalId, partidas]
  )

  if (outros.length === 0) return null

  return (
    <section aria-labelledby="confronto-titulo" className="flex flex-col gap-3">
      <h2 id="confronto-titulo" className="text-sm font-semibold">
        Confronto direto
      </h2>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Escolha o {rotuloCandidato}</span>
        <SelectNative
          value={rivalId}
          onChange={(e) => setRivalId(e.target.value)}
          aria-label={`Escolher ${rotuloCandidato} do confronto`}
          className="md:h-9"
        >
          {outros.map((id) => (
            <option key={id} value={id}>
              {identidades[id]?.nome ?? "Competidor"}
            </option>
          ))}
        </SelectNative>
      </label>

      {confronto ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            <Identidade ident={identidades[atualId]} />
            <span className="text-muted-foreground">x</span>
            <Identidade ident={identidades[rivalId]} />
          </div>
          {confronto.jogos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Ainda não se enfrentaram nesta demonstração.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <Numero valor={confronto.aVitorias} rotulo="Vitórias" />
              <Numero valor={confronto.empates} rotulo="Empates" />
              <Numero valor={confronto.bVitorias} rotulo="Derrotas" />
              <Numero valor={confronto.aGolsPro} rotulo="Gols pró" />
              <Numero valor={confronto.aGolsContra} rotulo="Gols contra" />
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
