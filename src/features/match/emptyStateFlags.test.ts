import { describe, expect, it } from "vitest"

import { deriveEmptyStateFlags } from "@/features/match/emptyStateFlags"

describe("deriveEmptyStateFlags", () => {
  it("sem organizar nem participar → semTorneios (estado 1)", () => {
    expect(
      deriveEmptyStateFlags({
        organizoCount: 0,
        participoCount: 0,
        avulsosAbertosCount: 0,
      }),
    ).toEqual({ semTorneios: true, temAvulsoAberto: false })
  })

  it("participa de algum torneio → não é usuário novo", () => {
    const f = deriveEmptyStateFlags({
      organizoCount: 0,
      participoCount: 2,
      avulsosAbertosCount: 0,
    })
    expect(f.semTorneios).toBe(false)
    expect(f.temAvulsoAberto).toBe(false)
  })

  it("tem avulso aberto → temAvulsoAberto (estado 3)", () => {
    const f = deriveEmptyStateFlags({
      organizoCount: 1,
      participoCount: 0,
      avulsosAbertosCount: 1,
    })
    expect(f.semTorneios).toBe(false)
    expect(f.temAvulsoAberto).toBe(true)
  })

  it("organiza torneios mas nenhum avulso aberto → estado 2", () => {
    const f = deriveEmptyStateFlags({
      organizoCount: 3,
      participoCount: 0,
      avulsosAbertosCount: 0,
    })
    expect(f.semTorneios).toBe(false)
    expect(f.temAvulsoAberto).toBe(false)
  })

  it("temAvulsoAberto vem da CONTAGEM de avulsos, não de organizo", () => {
    // Blindagem contra a inversão de condição: mesmo com muitos torneios
    // organizados, sem avulso aberto o flag é falso.
    expect(
      deriveEmptyStateFlags({
        organizoCount: 5,
        participoCount: 5,
        avulsosAbertosCount: 0,
      }).temAvulsoAberto,
    ).toBe(false)
  })
})
