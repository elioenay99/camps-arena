"use client"

import { useId, useState } from "react"
import { ChevronDown } from "lucide-react"

import {
  classesLinha,
  estatisticasSecundarias,
  LinhaCelulas,
  type EstiloLinha,
} from "@/features/standings/components/standingsCells"
import { useStandingsModo } from "@/features/standings/components/standingsModoContext"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"
import type { ItemForma } from "@/features/standings/insights"

/**
 * Linha da classificação com DIVULGAÇÃO PROGRESSIVA (só quando `expansivel`). No
 * mobile compacto (`compacto` do contexto), a linha mostra as colunas
 * prioritárias e expõe um `<button aria-expanded aria-controls>` que revela uma
 * `<tr>` de detalhe com V/E/D/GP/GC como pares rótulo→valor. O gatilho e a linha
 * de detalhe são renderizados condicionalmente por JS (não CSS), para o estado
 * ser perceptível a leitor de tela e verificável em teste. No desktop
 * (`compacto=false`) nenhum gatilho aparece. change add-classificacao-a11y-responsiva.
 */
export function StandingsRow({
  linha,
  estilo,
  temPromedio,
  promedioValor,
  hrefCompetidorBase,
  temForma,
  formaItens,
  colSpanN,
}: {
  linha: LinhaComNome
  estilo: EstiloLinha
  temPromedio: boolean
  promedioValor?: number
  hrefCompetidorBase?: string
  temForma: boolean
  formaItens?: ItemForma[]
  colSpanN: number
}) {
  const { compacto } = useStandingsModo()
  const [aberto, setAberto] = useState(false)
  const detalheId = useId()

  const chevron = compacto ? (
    <button
      type="button"
      aria-expanded={aberto}
      aria-controls={detalheId}
      aria-label={
        aberto
          ? `Ocultar estatísticas de ${linha.nome}`
          : `Mostrar estatísticas de ${linha.nome}`
      }
      onClick={() => setAberto((v) => !v)}
      className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ChevronDown
        aria-hidden="true"
        className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`}
      />
    </button>
  ) : null

  return (
    <>
      <tr className={classesLinha(estilo)}>
        <LinhaCelulas
          linha={linha}
          estilo={estilo}
          temPromedio={temPromedio}
          promedioValor={promedioValor}
          hrefCompetidorBase={hrefCompetidorBase}
          temForma={temForma}
          formaItens={formaItens}
          chevron={chevron}
        />
      </tr>
      {compacto ? (
        // A linha de detalhe monta SEMPRE que o gatilho existe (compacto) e
        // apenas alterna `hidden`, para o IDREF de `aria-controls` sempre
        // resolver — colapsada ela existe no DOM, só oculta (evita aria-controls
        // pendurado). change add-classificacao-a11y-responsiva.
        <tr
          id={detalheId}
          hidden={!aberto}
          className="border-b bg-muted/20 last:border-b-0"
        >
          <td colSpan={colSpanN} className="px-3 py-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {estatisticasSecundarias(linha).map((s) => (
                <div key={s.rotulo} className="flex items-center gap-1">
                  <dt className="text-muted-foreground">{s.rotulo}:</dt>
                  <dd className="font-medium tabular-nums">{s.valor}</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  )
}
