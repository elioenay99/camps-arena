import { Flame } from "lucide-react"

import { escudoPublicUrl } from "@/lib/escudos"
import type { ItemForma } from "@/features/standings/insights"
import { FormaBadges } from "@/features/standings/components/FormaBadges"
import { TeamCrest } from "@/features/team/components/TeamCrest"

/**
 * Mock FIEL da classificação (não screenshot): reproduz a tabela real com a coluna
 * "Forma" (últimos 5, V/E/D — Frente 1/insights) e um badge de destaque. Dados
 * curados hardcoded, escudos reais via `TeamCrest`. Bloco decorativo `aria-hidden`
 * (o `sr-only` descritivo mora na seção que o compõe). RSC puro.
 */

const V = (wo = false): ItemForma => ({ resultado: "V", wo, rodada: null })
const E = (wo = false): ItemForma => ({ resultado: "E", wo, rodada: null })
const D = (wo = false): ItemForma => ({ resultado: "D", wo, rodada: null })

interface LinhaMock {
  pos: number
  nome: string
  id: number
  pts: number
  forma: ItemForma[]
  destaque?: string
}

const LINHAS: LinhaMock[] = [
  { pos: 1, nome: "Flamengo", id: 127, pts: 40, forma: [V(), V(), E(), V(), V()], destaque: "Melhor ataque" },
  { pos: 2, nome: "Palmeiras", id: 121, pts: 37, forma: [V(), D(), V(), V(), E()] },
  { pos: 3, nome: "Cruzeiro", id: 135, pts: 33, forma: [E(), V(), V(), D(), V()] },
  { pos: 4, nome: "Bahia", id: 118, pts: 30, forma: [D(), E(), V(), E(), D()] },
]

export function MockClassificacao() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-medium">Classificação</p>
        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          Forma · destaques
        </span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-muted-foreground text-[11px] tracking-wide uppercase">
            <th className="w-6 py-1 text-left font-medium">#</th>
            <th className="py-1 text-left font-medium">Clube</th>
            <th className="w-9 py-1 text-right font-medium tabular-nums">Pts</th>
            <th className="py-1 pl-3 text-right font-medium">Forma</th>
          </tr>
        </thead>
        <tbody>
          {LINHAS.map((linha) => {
            const lider = linha.pos === 1
            return (
              <tr
                key={linha.pos}
                className={`border-t ${lider ? "bg-gold/10" : ""}`}
              >
                <td
                  className={`py-2 font-display text-sm font-bold tabular-nums ${
                    lider ? "text-gold-ink" : "text-muted-foreground"
                  }`}
                >
                  {linha.pos}
                </td>
                <td className="py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamCrest
                      nome={linha.nome}
                      escudoUrl={escudoPublicUrl(linha.id)}
                      size={20}
                    />
                    <span className="min-w-0 truncate font-medium">{linha.nome}</span>
                    {linha.destaque ? (
                      <span className="border-gold/30 bg-gold/12 text-gold-ink hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium sm:inline-flex">
                        <Flame className="size-3" aria-hidden="true" />
                        {linha.destaque}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="py-2 text-right font-display text-sm font-bold tabular-nums">
                  {linha.pts}
                </td>
                <td className="py-2 pl-3 text-right">
                  <span className="inline-flex justify-end">
                    <FormaBadges itens={linha.forma} />
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
