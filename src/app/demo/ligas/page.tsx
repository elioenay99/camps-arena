import Link from "next/link"
import { Layers } from "lucide-react"

import { PIRAMIDE } from "@/features/demo/fixtures/piramide"

export default function DemoLigasPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold">Pirâmides</h1>
        <p className="text-sm text-muted-foreground">
          Temporadas em múltiplas divisões, com acesso e rebaixamento.
        </p>
      </div>
      <ul className="flex list-none flex-col gap-2 p-0">
        <li>
          <Link
            href={`/demo/ligas/${PIRAMIDE.id}`}
            prefetch={false}
            className="flex items-center gap-3 rounded-xl border bg-card/60 px-3 py-3 hover:bg-muted/40"
          >
            <Layers aria-hidden className="size-5 text-primary/70" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{PIRAMIDE.nome}</span>
              <span className="text-xs text-muted-foreground">
                {PIRAMIDE.divisoes.length} divisões
              </span>
            </span>
          </Link>
        </li>
      </ul>
    </div>
  )
}
