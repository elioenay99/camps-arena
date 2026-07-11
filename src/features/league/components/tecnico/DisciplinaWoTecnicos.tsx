import Link from "next/link"

import type { TecnicoDisciplina } from "@/features/league/data/getDisciplinaWoTorneio"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { LIMITE_WO_SEGUIDOS } from "@/features/standings/woStreak"
import { cn } from "@/lib/utils"

import {
  ExpulsarTecnicoButton,
  PerdoarWoButton,
} from "./DisciplinaWoButtons"

/**
 * Painel disciplinar de W.O. seguidos (change add-contador-wo-tecnico). RSC: só
 * folhas dos botões são client. A página gateia por `podeGerir`; aqui listamos os
 * técnicos com streak > 0. Abaixo do limite mostramos só a contagem (o auto-perdão
 * cuida); no limite ou acima, exibimos "crítico" + as ações Perdoar/Expulsar.
 */
export function DisciplinaWoTecnicos({
  tournamentId,
  tecnicos,
}: {
  tournamentId: string
  tecnicos: TecnicoDisciplina[]
}) {
  if (tecnicos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum técnico com W.O. seguidos.
      </p>
    )
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {tecnicos.map((t) => {
        const critico = t.streak >= LIMITE_WO_SEGUIDOS
        return (
          <li
            key={t.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar nome={t.nome} avatarUrl={t.avatarUrl} size={32} />
              <Link
                href={`/dashboard/ligas/tecnico/${t.userId}`}
                prefetch={false}
                className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
              >
                {t.nome}
              </Link>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  critico
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/40 text-muted-foreground"
                )}
              >
                {t.streak} {t.streak === 1 ? "W.O. seguido" : "W.O. seguidos"}
                {critico ? " · crítico" : ""}
              </span>
            </div>
            {critico ? (
              <div className="flex flex-wrap items-center gap-2">
                <PerdoarWoButton tournamentId={tournamentId} userId={t.userId} />
                <ExpulsarTecnicoButton
                  tournamentId={tournamentId}
                  slotId={t.slotId}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
