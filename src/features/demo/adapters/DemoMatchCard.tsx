"use client"

import type { PartidaCronologica } from "@/features/standings/insights"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type { IdentidadeDemo, TorneioDemo } from "@/features/demo/store/tipos"
import { useDemoStore } from "@/features/demo/store/useDemoStore"

import { DemoScoreModal } from "./DemoScoreModal"

function Identidade({ ident }: { ident: IdentidadeDemo | undefined }) {
  const nome = ident?.nome ?? "A definir"
  return (
    <span className="flex min-w-0 items-center gap-2">
      {ident && !ident.ehCompetitivo ? (
        <UserAvatar nome={nome} avatarUrl={ident.avatarUrl} size={24} />
      ) : (
        <TeamCrest nome={nome} escudoUrl={ident?.escudoUrl ?? null} size={24} />
      )}
      <span className="truncate text-sm font-medium">{nome}</span>
    </span>
  )
}

/**
 * Card de partida da demonstração — reconstruído a partir dos ÁTOMOS
 * (`TeamCrest`/`UserAvatar`) + `DemoScoreModal`. NÃO reusa `MatchCard`/`*Connected`/
 * `Live*` (acoplam action/Realtime). Identidade ramifica por `ehCompetitivo`.
 */
export function DemoMatchCard({
  torneio,
  partida,
}: {
  torneio: TorneioDemo
  partida: PartidaCronologica
}) {
  const { state } = useDemoStore()
  const id1 = partida.participante_1
  const id2 = partida.participante_2
  const encerrada = partida.status === "encerrada"
  const nome1 = (id1 ? state.identidades[id1]?.nome : undefined) ?? "A definir"
  const nome2 = (id2 ? state.identidades[id2]?.nome : undefined) ?? "A definir"
  const rotuloPlacar = encerrada ? "Editar placar" : "Lançar placar"

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Identidade ident={id1 ? state.identidades[id1] : undefined} />
            <span className="font-display text-base tabular-nums">{partida.placar_1}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Identidade ident={id2 ? state.identidades[id2] : undefined} />
            <span className="font-display text-base tabular-nums">{partida.placar_2}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {partida.rodada != null ? `Rodada ${partida.rodada}` : "Partida"}
          {" · "}
          {encerrada ? "Encerrada" : "Em andamento"}
        </span>
        <DemoScoreModal
          torneio={torneio}
          matchId={partida.id}
          participante1Id={id1}
          participante2Id={id2}
          rodada={partida.rodada}
          placar1={partida.placar_1}
          placar2={partida.placar_2}
          triggerLabel={rotuloPlacar}
          triggerAriaLabel={`${rotuloPlacar} de ${nome1} x ${nome2}`}
          triggerClassName="inline-flex min-h-11 items-center px-2 text-xs font-medium text-primary hover:underline"
        />
      </div>
    </div>
  )
}
