"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"

/** Quantos colocados aparecem antes de "Ver mais". */
const TOPO = 10

/**
 * Wrapper client mínimo dos rankings (artilharia/Muralha): recebe as `<li>` já
 * renderizadas pelo RSC como `children`, RENDERIZA ele mesmo o `<ol>` (um
 * `<button>` não pode ser filho de `<ol>`) e mostra só os {@link TOPO} primeiros,
 * revelando o restante com um botão "Ver mais (N) / Ver menos" IRMÃO da lista.
 * O total vem de `React.Children.count` — os fetchers/RSC não mudam.
 */
export function RankingExpansivel({ children }: { children: React.ReactNode }) {
  const itens = React.Children.toArray(children)
  const total = itens.length
  const temMais = total > TOPO
  const [expandido, setExpandido] = React.useState(false)
  const listaId = React.useId()

  const visiveis = expandido || !temMais ? itens : itens.slice(0, TOPO)
  const restantes = total - TOPO

  return (
    <div className="flex flex-col">
      <ol id={listaId} className="flex list-none flex-col gap-2 p-0">
        {visiveis}
      </ol>
      {temMais ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={expandido}
          aria-controls={listaId}
          onClick={() => setExpandido((v) => !v)}
          className="mt-3 min-h-11 self-center rounded-full"
        >
          {expandido ? "Ver menos" : `Ver mais (${restantes})`}
        </Button>
      ) : null}
    </div>
  )
}
