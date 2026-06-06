import { describe, expect, it } from "vitest"

import { gerarCodigoConvite, TAMANHO_CODIGO_CONVITE } from "@/lib/invite-code"

describe("gerarCodigoConvite", () => {
  it("gera 16 caracteres do alfabeto Crockford minúsculo (sem i/l/o/u)", () => {
    for (let i = 0; i < 50; i++) {
      const codigo = gerarCodigoConvite()
      expect(codigo).toHaveLength(TAMANHO_CODIGO_CONVITE)
      expect(codigo).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{16}$/)
    }
  })

  it("não repete códigos (aleatoriedade básica)", () => {
    const codigos = new Set(Array.from({ length: 200 }, gerarCodigoConvite))
    expect(codigos.size).toBe(200)
  })

  it("é aceito pelo schema de código de convite (lib e Zod alinhados)", async () => {
    const { codigoConviteSchema } = await import("@/schema/participantSchema")
    for (let i = 0; i < 20; i++) {
      expect(codigoConviteSchema.safeParse(gerarCodigoConvite()).success).toBe(true)
    }
  })
})
