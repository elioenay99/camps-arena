import { describe, expect, it } from "vitest"

import { buttonVariants } from "./button"

/**
 * Trava o contrato de ALVO DE TOQUE do primitivo (spec `design-system`:
 * "Alvos de toque de ao menos 44px no mobile"). O defeito que originou estes
 * testes passou despercebido justamente por não existir invariante escrita:
 * `lg` valia 36px no mobile — MENOR que os 44px do `default`.
 *
 * Asserção por classe utilitária, não por pixel medido: o gate não roda browser.
 * Escala Tailwind: `h-N`/`size-N` = N * 4px (h-11 = 44px, h-12 = 48px).
 */

/** Extrai o valor N de `h-N`/`size-N` sem prefixo de breakpoint (= mobile). */
function alturaMobile(classes: string): number {
  const semBreakpoint = classes
    .split(/\s+/)
    .filter((c) => !c.includes(":") && /^(h|size)-\d+$/.test(c))
  expect(semBreakpoint, `sem classe de altura mobile em "${classes}"`).toHaveLength(1)
  return Number(semBreakpoint[0].split("-")[1])
}

/** Extrai o valor N de `md:h-N`/`md:size-N` (= desktop), 0 se não houver. */
function alturaDesktop(classes: string): number {
  const comMd = classes
    .split(/\s+/)
    .filter((c) => /^md:(h|size)-\d+$/.test(c))
  return comMd.length === 1 ? Number(comMd[0].split("-")[1]) : 0
}

const REM = 4
const ALVO_MINIMO = 44

describe("buttonVariants — alvo de toque", () => {
  const comAlvo = ["default", "sm", "lg", "icon", "icon-sm", "icon-lg"] as const

  it.each(comAlvo)("size=%s tem ao menos 44px de alvo no mobile", (size) => {
    const classes = buttonVariants({ size })
    expect(alturaMobile(classes) * REM).toBeGreaterThanOrEqual(ALVO_MINIMO)
  })

  it.each(comAlvo)("size=%s restaura a densidade compacta em md+", (size) => {
    const mobile = alturaMobile(buttonVariants({ size }))
    const desktop = alturaDesktop(buttonVariants({ size }))
    expect(desktop, `size=${size} deveria declarar md:`).toBeGreaterThan(0)
    expect(desktop).toBeLessThan(mobile)
  })

  it("lg NÃO é menor que default em nenhum breakpoint", () => {
    const lg = buttonVariants({ size: "lg" })
    const padrao = buttonVariants({ size: "default" })
    expect(alturaMobile(lg)).toBeGreaterThanOrEqual(alturaMobile(padrao))
    expect(alturaDesktop(lg)).toBeGreaterThanOrEqual(alturaDesktop(padrao))
  })

  it("os tamanhos são monotônicos no mobile (xs <= sm <= default <= lg)", () => {
    const alturas = (["xs", "sm", "default", "lg"] as const).map((size) =>
      alturaMobile(buttonVariants({ size }))
    )
    expect(alturas).toEqual([...alturas].sort((a, b) => a - b))
  })

  it("os tamanhos de ícone são monotônicos no mobile", () => {
    const alturas = (["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map((size) =>
      alturaMobile(buttonVariants({ size }))
    )
    expect(alturas).toEqual([...alturas].sort((a, b) => a - b))
  })

  it.each(["xs", "icon-xs"] as const)(
    "size=%s permanece FORA da regra dos 44px (válvula de densidade extrema)",
    (size) => {
      // Documenta a exceção: a chamada é responsável pelo próprio alvo de toque.
      expect(alturaMobile(buttonVariants({ size })) * REM).toBeLessThan(ALVO_MINIMO)
    }
  )

  it("o size default continua sendo h-11 md:h-8", () => {
    const classes = buttonVariants({ size: "default" })
    expect(classes).toContain("h-11")
    expect(classes).toContain("md:h-8")
  })
})
