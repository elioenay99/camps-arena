"use client"

import { Layers } from "lucide-react"

import { Button } from "@/components/ui/button"
import { computeStandings } from "@/features/standings/computeStandings"
import { calcularForma } from "@/features/standings/insights"
import { ClassificacaoResponsiva } from "@/features/standings/components/ClassificacaoResponsiva"
import { StandingsTable } from "@/features/standings/components/StandingsTable"
import { comNome } from "@/features/demo/derive/derivarClassificacao"
import { PIRAMIDE, type DivisaoDemo } from "@/features/demo/fixtures/piramide"
import { useDemoStore, usePerfilFlags } from "@/features/demo/store/useDemoStore"

import { ReadOnlyBanner } from "./ReadOnlyBanner"

function Divisao({ divisao }: { divisao: DivisaoDemo }) {
  const { state } = useDemoStore()
  const brutas = computeStandings(PIRAMIDE.regras, divisao.partidas, PIRAMIDE.tiebreaker)
  const linhas = comNome(brutas, state.identidades)
  const forma = calcularForma(divisao.partidas)

  return (
    <section aria-label={`Divisão ${divisao.nome}`} className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Layers aria-hidden className="size-4 text-primary/70" />
        {divisao.nome}
      </h2>
      <ClassificacaoResponsiva>
        <StandingsTable
          linhas={linhas}
          rotuloLado="Clube"
          zonas={divisao.zonas}
          formaPorParticipante={forma}
          hrefCompetidorBase="/demo/ligas/competidor"
          expansivel
        />
      </ClassificacaoResponsiva>
    </section>
  )
}

export function DemoLigaView() {
  const flags = usePerfilFlags()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold">{PIRAMIDE.nome}</h1>
        <p className="text-sm text-muted-foreground">
          Temporada com acesso e rebaixamento entre as divisões.
        </p>
      </div>

      {flags.podeGerir ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled>
              Montar temporada
            </Button>
            <Button size="sm" variant="outline" disabled>
              Confirmar sobe/cai
            </Button>
            <Button size="sm" variant="outline" disabled>
              Montar playoffs
            </Button>
          </div>
          <ReadOnlyBanner titulo="Gestão da temporada">
            Como “{"gestor"}”, você veria estas ações ativas no Goliseu real. Aqui
            ficam desabilitadas.
          </ReadOnlyBanner>
        </div>
      ) : (
        <ReadOnlyBanner titulo="Gestão da temporada">
          As ações de montar temporada, confirmar sobe/cai e playoffs aparecem para
          perfis de gestor/admin. Troque o perfil no topo para vê-las.
        </ReadOnlyBanner>
      )}

      {PIRAMIDE.divisoes.map((d) => (
        <Divisao key={d.id} divisao={d} />
      ))}
    </div>
  )
}
