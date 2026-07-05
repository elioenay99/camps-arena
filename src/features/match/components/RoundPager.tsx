"use client"

import { useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FecharRodadaButton } from "@/features/match/components/WoButtons"

export type RodadaConteudo = {
  rodada: number
  /** Conteúdo da rodada JÁ RENDERIZADO no servidor (PII do wa.me embutida no link). */
  content: React.ReactNode
}

/**
 * Passador por rodada: mostra UMA rodada por vez com ‹ anterior · seletor ·
 * próxima › e o "Fechar rodada" (na rodada ativa, p/ quem encerra). Os nós já
 * vêm renderizados do servidor — este client só alterna qual aparece, sem tocar
 * em dados crus nem em PII. `rounds` deve vir ordenado por rodada.
 */
export function RoundPager({
  rounds,
  rodadaInicial,
  tournamentId,
  rodadaAtiva,
  podeFechar = false,
}: {
  rounds: RodadaConteudo[]
  rodadaInicial?: number | null
  tournamentId?: string
  rodadaAtiva?: number | null
  podeFechar?: boolean
}) {
  // Ancorado ao NÚMERO da rodada (não ao índice de array): se a lista encolher
  // entre renders (uma rodada anterior resolvida por revalidação na mesma aba),
  // o leitor permanece na MESMA rodada em vez de "pular" para o slot vizinho.
  const [rodadaSel, setRodadaSel] = useState<number | null>(
    rodadaInicial ?? null
  )

  if (rounds.length === 0) return null
  // Deriva o índice por render: rodada selecionada → rodada inicial → primeira.
  // Cobre a rodada selecionada/inicial que deixou de existir (revalidação).
  let seguro = rounds.findIndex((r) => r.rodada === rodadaSel)
  if (seguro < 0) seguro = rounds.findIndex((r) => r.rodada === rodadaInicial)
  if (seguro < 0) seguro = 0
  const atual = rounds[seguro]
  const total = rounds.length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            // Alvo de toque ≥44px no mobile (icon-sm é 28px); compacto em md+.
            className="size-11 md:size-7"
            aria-label="Rodada anterior"
            disabled={seguro === 0}
            onClick={() => setRodadaSel(rounds[seguro - 1].rodada)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>

          {/* Pular direto: select nativo — ótimo no mobile com muitas rodadas. */}
          <span className="relative inline-flex items-center">
            <select
              aria-label="Ir para a rodada"
              value={atual.rodada}
              onChange={(e) => setRodadaSel(Number(e.target.value))}
              className="min-h-11 appearance-none rounded-lg border border-input bg-transparent py-1.5 pr-8 pl-3 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring md:min-h-0 dark:bg-input/30"
            >
              {rounds.map((r) => (
                <option key={r.rodada} value={r.rodada}>{`Rodada ${r.rodada}`}</option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2 size-4 opacity-60"
              aria-hidden="true"
            />
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">{`de ${total}`}</span>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            // Alvo de toque ≥44px no mobile (icon-sm é 28px); compacto em md+.
            className="size-11 md:size-7"
            aria-label="Próxima rodada"
            disabled={seguro >= total - 1}
            onClick={() => setRodadaSel(rounds[seguro + 1].rodada)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        {podeFechar && tournamentId && atual.rodada === rodadaAtiva ? (
          <FecharRodadaButton tournamentId={tournamentId} rodada={atual.rodada} />
        ) : null}
      </div>

      {/* Só o resumo curto é região live: o conteúdo da rodada fica FORA dela,
          senão o leitor de tela relê todos os jogos a cada troca de rodada. */}
      <div>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {`Rodada ${atual.rodada} de ${total}`}
        </span>
        {atual.content}
      </div>
    </div>
  )
}
