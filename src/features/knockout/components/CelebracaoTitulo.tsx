"use client"

import { useEffect, useState } from "react"

/**
 * Celebração ATIVA e ÚNICA do campeão (change add-frente-compartilhavel): um
 * burst one-shot de confete sobre o destaque do campeão, colorido pela `cor` do
 * campeonato (`resolverCoresTorneio`). Componente CLIENT ancorado DENTRO do
 * `BracketView` (RSC) — só recebe props SERIALIZÁVEIS (`cor` + `chaveId`), nunca
 * JSX de client-comp cruzando a fronteira RSC (lição `e559a9f`).
 *
 * Opt-out por `prefers-reduced-motion` (via `matchMedia` — nem monta o confete;
 * o CSS também zera o keyframe, defesa em profundidade). Guard anti-repetição por
 * `chaveId` em `sessionStorage`: não reanima a cada `router.refresh`/renavegação.
 */

const N_PECAS = 18

/** Peças espalhadas em círculo — determinístico por índice (sem Math.random, sem
 * mismatch de hidratação: só renderiza APÓS montar). */
const PECAS = Array.from({ length: N_PECAS }, (_, i) => {
  const ang = (i / N_PECAS) * Math.PI * 2
  const dist = 70 + (i % 3) * 26
  return {
    bx: `${Math.round(Math.cos(ang) * dist)}px`,
    by: `${Math.round(Math.sin(ang) * dist)}px`,
    br: `${i % 2 === 0 ? 320 : -320}deg`,
    delay: `${(i % 4) * 40}ms`,
    tam: 6 + (i % 3) * 2,
  }
})

export function CelebracaoTitulo({
  cor,
  chaveId,
}: {
  /** Cor do campeonato (hex) — pinta o confete via CSS custom property. */
  cor: string
  /** Identificador estável da chave decidida — guard anti-repetição. */
  chaveId: string
}) {
  const [ativo, setAtivo] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    // Opt-out por movimento reduzido: nem monta o confete.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    // Guard anti-repetição por chave: dispara UMA vez por decisão.
    const chave = `goliseu:celebra:${chaveId}`
    try {
      if (window.sessionStorage.getItem(chave)) return
      window.sessionStorage.setItem(chave, "1")
    } catch {
      // sessionStorage indisponível (modo privado antigo): segue celebrando 1x.
    }
    // One-shot intencional: o efeito SINCRONIZA com sistemas externos (matchMedia
    // + sessionStorage) para disparar UMA animação ao decidir a chave. Não é
    // cascata de render (roda uma vez por chaveId, guardado acima).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAtivo(true)
    const t = window.setTimeout(() => setAtivo(false), 1300)
    return () => window.clearTimeout(t)
  }, [chaveId])

  if (!ativo) return null

  return (
    <span
      aria-hidden="true"
      data-testid="celebracao-confete"
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ ["--burst-cor" as string]: cor }}
    >
      {PECAS.map((p, i) => (
        <span
          key={i}
          className="hs-burst absolute top-1/2 left-1/2 block rounded-[1px]"
          style={
            {
              width: p.tam,
              height: p.tam,
              marginLeft: -p.tam / 2,
              marginTop: -p.tam / 2,
              backgroundColor: "var(--burst-cor)",
              animationDelay: p.delay,
              ["--bx" as string]: p.bx,
              ["--by" as string]: p.by,
              ["--br" as string]: p.br,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
