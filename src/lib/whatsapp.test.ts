import { describe, expect, it } from "vitest"

import { linkWhatsApp, mensagemConvocacao } from "@/lib/whatsapp"

describe("linkWhatsApp", () => {
  it("celular BR de 11 dígitos ganha o DDI 55", () => {
    expect(linkWhatsApp("11912345678")).toBe("https://wa.me/5511912345678")
  })

  it("aceita máscara (normaliza para dígitos)", () => {
    expect(linkWhatsApp("(11) 91234-5678")).toBe("https://wa.me/5511912345678")
  })

  it("13 dígitos começando com 55 entram diretos (já com DDI)", () => {
    expect(linkWhatsApp("5511912345678")).toBe("https://wa.me/5511912345678")
  })

  it("formato inválido, vazio ou nulo → null (sem atalho)", () => {
    expect(linkWhatsApp("1234")).toBeNull() // fixo/curto
    expect(linkWhatsApp("5511912345678901")).toBeNull() // longo demais
    // 13 dígitos SEM prefixo 55 não é DDI Brasil — rejeitado.
    expect(linkWhatsApp("9911912345678")).toBeNull()
    expect(linkWhatsApp("")).toBeNull()
    expect(linkWhatsApp(null)).toBeNull()
    expect(linkWhatsApp(undefined)).toBeNull()
  })

  it("anexa a mensagem em ?text= com URL-encoding", () => {
    const link = linkWhatsApp("11912345678", "Fala, Beto! Bora?")
    expect(link).toBe(
      `https://wa.me/5511912345678?text=${encodeURIComponent("Fala, Beto! Bora?")}`
    )
  })

  it("sem mensagem o link abre o chat vazio (compat com o uso antigo)", () => {
    expect(linkWhatsApp("11912345678")).not.toContain("?text=")
  })
})

describe("mensagemConvocacao", () => {
  const tournamentId = "11111111-1111-4111-8111-111111111111"

  it("sauda o adversário, cita o torneio e termina com a URL absoluta", () => {
    const msg = mensagemConvocacao({
      adversario: "Beto",
      titulo: "Copa da Firma",
      tournamentId,
    })
    expect(msg).toBe(
      `Fala, Beto! Bora jogar nossa partida do Copa da Firma no Arena? http://localhost:3000/dashboard/torneios/${tournamentId}`
    )
  })

  it("sem nome a saudação é genérica; sem título usa o fallback", () => {
    const msg = mensagemConvocacao({ tournamentId })
    expect(msg).toMatch(/^Fala! Bora jogar nossa partida do nosso torneio/)
    // Nome/título só com espaços contam como ausentes.
    expect(
      mensagemConvocacao({ adversario: "  ", titulo: "  ", tournamentId })
    ).toMatch(/^Fala! Bora jogar nossa partida do nosso torneio/)
  })
})
