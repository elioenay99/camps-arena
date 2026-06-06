import { describe, expect, it } from "vitest"

import {
  aceitarConviteSchema,
  codigoConviteSchema,
  regenerarConviteSchema,
  removerParticipanteSchema,
  sairDoTorneioSchema,
} from "@/schema/participantSchema"

const UUID = "11111111-1111-4111-8111-111111111111"

describe("codigoConviteSchema", () => {
  it("aceita o formato gerado (16 chars minúsculos)", () => {
    expect(codigoConviteSchema.safeParse("abc123def456ghj7").success).toBe(true)
  })

  it("aceita o intervalo tolerado (8–64 alfanuméricos minúsculos)", () => {
    expect(codigoConviteSchema.safeParse("a".repeat(8)).success).toBe(true)
    expect(codigoConviteSchema.safeParse("a".repeat(64)).success).toBe(true)
  })

  it("rejeita lixo: curto, longo, maiúsculas, símbolos, path traversal", () => {
    for (const invalido of [
      "curto",
      "a".repeat(65),
      "ABC123DEF456GHJ7",
      "abc 123",
      "../../etc/passwd",
      "abc-123-def-456!",
      "",
    ]) {
      expect(codigoConviteSchema.safeParse(invalido).success).toBe(false)
    }
  })

  it("rejeita não-string (File de FormData, null)", () => {
    expect(codigoConviteSchema.safeParse(null).success).toBe(false)
    expect(codigoConviteSchema.safeParse(123).success).toBe(false)
  })
})

describe("schemas de participação", () => {
  it("aceitarConvite exige código válido", () => {
    expect(aceitarConviteSchema.safeParse({ codigo: "abc123def456ghj7" }).success).toBe(true)
    expect(aceitarConviteSchema.safeParse({ codigo: "###" }).success).toBe(false)
  })

  it("sair/regenerar exigem uuid de torneio", () => {
    expect(sairDoTorneioSchema.safeParse({ tournamentId: UUID }).success).toBe(true)
    expect(sairDoTorneioSchema.safeParse({ tournamentId: "x" }).success).toBe(false)
    expect(regenerarConviteSchema.safeParse({ tournamentId: UUID }).success).toBe(true)
    expect(regenerarConviteSchema.safeParse({ tournamentId: 7 }).success).toBe(false)
  })

  it("removerParticipante exige os dois uuids", () => {
    expect(
      removerParticipanteSchema.safeParse({ tournamentId: UUID, userId: UUID }).success
    ).toBe(true)
    expect(
      removerParticipanteSchema.safeParse({ tournamentId: UUID, userId: "x" }).success
    ).toBe(false)
    expect(removerParticipanteSchema.safeParse({ tournamentId: UUID }).success).toBe(false)
  })
})
