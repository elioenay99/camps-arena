import { describe, expect, it } from "vitest"

import { createTournamentSchema } from "@/schema/tournamentSchema"

describe("createTournamentSchema", () => {
  it("aceita título válido e usa default público", () => {
    const r = createTournamentSchema.parse({ titulo: "Copa" })
    expect(r).toEqual({ titulo: "Copa", isPublic: true })
  })

  it("aplica trim no título", () => {
    const r = createTournamentSchema.parse({ titulo: "  Liga  ", isPublic: false })
    expect(r).toEqual({ titulo: "Liga", isPublic: false })
  })

  it("rejeita título curto (< 2 após trim)", () => {
    expect(createTournamentSchema.safeParse({ titulo: " a " }).success).toBe(false)
  })

  it("rejeita só espaços (vira vazio após trim)", () => {
    expect(createTournamentSchema.safeParse({ titulo: "   " }).success).toBe(false)
  })

  it("aceita os limites exatos (2 e 80 caracteres)", () => {
    expect(createTournamentSchema.safeParse({ titulo: "ab" }).success).toBe(true)
    expect(createTournamentSchema.safeParse({ titulo: "x".repeat(80) }).success).toBe(true)
  })

  it("rejeita título longo (> 80)", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "x".repeat(81) }).success
    ).toBe(false)
  })

  it("isPublic é estrito (boolean), não coage 'on'/string", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", isPublic: "on" }).success
    ).toBe(false)
  })

  it("respeita isPublic explícito", () => {
    expect(createTournamentSchema.parse({ titulo: "Copa", isPublic: false }).isPublic).toBe(
      false
    )
  })
})
