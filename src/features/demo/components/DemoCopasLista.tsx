"use client"

import Link from "next/link"
import { Network } from "lucide-react"

import { StatusPill } from "@/features/tournament/components/StatusPill"
import { useDemoStore } from "@/features/demo/store/useDemoStore"

export function DemoCopasLista() {
  const { state } = useDemoStore()
  const copas = state.torneios.filter((t) => t.chave.length > 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold">Copas</h1>
        <p className="text-sm text-muted-foreground">
          Mata-mata eliminatório — quem perde sai.
        </p>
      </div>
      {copas.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhuma copa nesta demonstração.
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {copas.map((t) => (
            <li key={t.id}>
              <Link
                href={`/demo/copas/${t.id}`}
                prefetch={false}
                className="flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-3 hover:bg-muted/40"
              >
                <Network aria-hidden className="size-5 text-primary/70" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.participantes.length} participantes
                  </span>
                </span>
                <StatusPill status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
