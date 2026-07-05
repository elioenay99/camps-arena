import Link from "next/link"

import { TeamCrest } from "@/features/team/components/TeamCrest"
import type { ClubeComandado } from "@/features/league/data/getTecnicoProfile"

/**
 * Clubes que o técnico comandou (change add-tecnicos-historico), agregados por
 * competidor persistente. Cada item linka para o perfil do competidor e marca o
 * clube que ele comanda ATUALMENTE ("atual"). RSC puro. Vazio → a seção some.
 */
export function ClubesComandados({ clubes }: { clubes: ClubeComandado[] }) {
  if (clubes.length === 0) return null

  return (
    <section aria-labelledby="clubes-titulo" className="flex flex-col gap-3">
      <h2
        id="clubes-titulo"
        className="font-display text-lg font-bold tracking-tight"
      >
        Clubes comandados
      </h2>
      <ul className="grid list-none gap-2 p-0">
        {clubes.map((clube) => (
          <li key={clube.competitorId}>
            <Link
              href={`/dashboard/ligas/competidor/${clube.competitorId}`}
              prefetch={false}
              className="hover:bg-muted/40 flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
            >
              <TeamCrest nome={clube.nome} escudoUrl={clube.escudoUrl} size={32} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">
                  {clube.nome}
                  {clube.vigente ? (
                    <span className="text-gold-ink ml-1.5 text-xs font-semibold">
                      · atual
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {clube.competitionNome.trim() || "Pirâmide"}
                  {clube.temporadas > 0 ? (
                    <>
                      <span aria-hidden="true"> · </span>
                      {clube.temporadas}{" "}
                      {clube.temporadas === 1 ? "temporada" : "temporadas"}
                    </>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
