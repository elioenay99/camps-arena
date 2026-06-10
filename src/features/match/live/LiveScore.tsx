"use client"

import { useEffect, useRef, useState } from "react"

import { useLiveMatch } from "@/features/match/live/LiveMatchesProvider"

/** Um número de placar que reage ao Realtime. Fora de um provider (ou antes do
 * primeiro evento) mostra o valor inicial vindo da RSC. Quando o número MUDA
 * (gol!), pula e pisca no primário — sem animar no load. */
export function LiveScore({
  matchId,
  field,
  initial,
}: {
  matchId: string
  field: "placar_1" | "placar_2"
  initial: number
}) {
  const live = useLiveMatch(matchId)
  const value = live ? live[field] : initial

  const [pop, setPop] = useState(false)
  const anterior = useRef(value)
  useEffect(() => {
    if (anterior.current === value) return
    anterior.current = value
    setPop(true)
    // Fallback: sob prefers-reduced-motion a animação é `none` e o
    // `animationend` nunca dispara — o timeout garante o reset do estado.
    const t = setTimeout(() => setPop(false), 600)
    return () => clearTimeout(t)
  }, [value])

  return (
    <span
      className={`inline-block font-display text-4xl font-bold tabular-nums sm:text-5xl ${
        pop ? "animate-score" : ""
      }`}
      aria-hidden="true"
      onAnimationEnd={() => setPop(false)}
    >
      {value}
    </span>
  )
}

/** Texto acessível do placar, vivo — espelha os dois números visíveis para o
 * leitor de tela sem divergir do que está na tela. */
export function LiveScoreSr({
  matchId,
  nome1,
  nome2,
  initial1,
  initial2,
}: {
  matchId: string
  nome1: string
  nome2: string
  initial1: number
  initial2: number
}) {
  const live = useLiveMatch(matchId)
  const p1 = live ? live.placar_1 : initial1
  const p2 = live ? live.placar_2 : initial2
  // Região live POLITE: anuncia a mudança de placar ao leitor de tela quando o
  // Realtime atualiza (gols são raros — polite não tagarela). Mesmo padrão do
  // MatchScoreModal. Não anuncia no load (live region só fala em mudanças).
  return (
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {`Placar atual: ${nome1} ${p1}, ${nome2} ${p2}`}
    </span>
  )
}
