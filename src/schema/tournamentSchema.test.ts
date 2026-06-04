import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createTournamentSchema, PONTOS_MAX } from "@/schema/tournamentSchema"

const PADRAO = { pontosVitoria: 3, pontosEmpate: 1, pontosDerrota: 0 }

describe("createTournamentSchema", () => {
  it("aceita título válido e usa defaults (público, 3/1/0)", () => {
    const r = createTournamentSchema.parse({ titulo: "Copa" })
    expect(r).toEqual({ titulo: "Copa", isPublic: true, ...PADRAO })
  })

  it("aplica trim no título", () => {
    const r = createTournamentSchema.parse({ titulo: "  Liga  ", isPublic: false })
    expect(r).toEqual({ titulo: "Liga", isPublic: false, ...PADRAO })
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

  it("aceita pontuação customizada coerente", () => {
    const r = createTournamentSchema.parse({
      titulo: "Copa",
      pontosVitoria: 2,
      pontosEmpate: 1,
      pontosDerrota: 0,
    })
    expect(r.pontosVitoria).toBe(2)
  })

  it("aceita os limites 0 e PONTOS_MAX (regra 100/100/100 inclusive)", () => {
    expect(
      createTournamentSchema.safeParse({
        titulo: "Copa",
        pontosVitoria: PONTOS_MAX,
        pontosEmpate: PONTOS_MAX,
        pontosDerrota: PONTOS_MAX,
      }).success
    ).toBe(true)
    expect(
      createTournamentSchema.safeParse({
        titulo: "Copa",
        pontosVitoria: 0,
        pontosEmpate: 0,
        pontosDerrota: 0,
      }).success
    ).toBe(true)
  })

  it("rejeita acima do teto, negativo e não-inteiro", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", pontosVitoria: PONTOS_MAX + 1 })
        .success
    ).toBe(false)
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", pontosDerrota: -1 }).success
    ).toBe(false)
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", pontosEmpate: 1.5 }).success
    ).toBe(false)
  })

  it("pontuação é estrita a número (não coage string)", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", pontosVitoria: "3" }).success
    ).toBe(false)
  })

  it("rejeita derrota valendo mais que empate, apontando o campo", () => {
    const r = createTournamentSchema.safeParse({
      titulo: "Copa",
      pontosEmpate: 1,
      pontosDerrota: 2,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(z.flattenError(r.error).fieldErrors.pontosDerrota).toBeTruthy()
    }
  })

  it("rejeita empate valendo mais que vitória, apontando o campo", () => {
    const r = createTournamentSchema.safeParse({
      titulo: "Copa",
      pontosVitoria: 1,
      pontosEmpate: 2,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(z.flattenError(r.error).fieldErrors.pontosEmpate).toBeTruthy()
    }
  })

  it("coerência também vale contra os DEFAULTS (vitória 0 com empate default 1)", () => {
    const r = createTournamentSchema.safeParse({ titulo: "Copa", pontosVitoria: 0 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(z.flattenError(r.error).fieldErrors.pontosEmpate).toBeTruthy()
    }
  })

  it("NaN é rejeitado (Number('abc') do form não passa)", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", pontosVitoria: Number.NaN })
        .success
    ).toBe(false)
  })
})
