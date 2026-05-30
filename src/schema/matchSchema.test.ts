import { describe, expect, it } from "vitest"

import { PLACAR_MAX, updateMatchScoreSchema } from "@/schema/matchSchema"

const UUID = "11111111-1111-4111-8111-111111111111"

describe("updateMatchScoreSchema", () => {
  it("aceita entrada válida", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: 3,
      placar_2: 1,
    })
    expect(r.success).toBe(true)
  })

  it("aceita os limites 0 e PLACAR_MAX", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: 0,
      placar_2: PLACAR_MAX,
    })
    expect(r.success).toBe(true)
  })

  it("rejeita placar negativo", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: -1,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita placar não-inteiro", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: 2.5,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita placar acima do teto", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: PLACAR_MAX + 1,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita matchId que não é uuid", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: "nao-e-uuid",
      placar_1: 0,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  // Endurecimento (auditoria Fase 4): sem z.coerce, lixo não vira placar.
  it("rejeita string numérica como placar (sem coerção)", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: "5",
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita string vazia (regressão do coerce '' -> 0)", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: "",
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita null como placar", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: null,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita NaN como placar", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: Number.NaN,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita quando falta um placar", () => {
    const r = updateMatchScoreSchema.safeParse({ matchId: UUID, placar_1: 1 })
    expect(r.success).toBe(false)
  })
})
