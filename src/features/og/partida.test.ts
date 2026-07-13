import { describe, expect, it } from "vitest"

import { projetarLadoPartida, seloDoResultado } from "@/features/og/partida"
import type { PartidaParaImagem } from "@/features/match/data/getPartidaParaImagem"

function partida(over: Partial<PartidaParaImagem> = {}): PartidaParaImagem {
  return {
    id: "m1",
    nome_1: "A",
    nome_2: "B",
    placar_1: 0,
    placar_2: 0,
    encerradaEm: "2026-01-01T00:00:00Z",
    rodada: 1,
    perna: null,
    grupo: null,
    escudo_1: null,
    escudo_2: null,
    wo: false,
    woVencedorLado: null,
    woDuplo: false,
    tournament_id: "t1",
    avatarUrl_1: null,
    avatarUrl_2: null,
    ...over,
  }
}

describe("seloDoResultado", () => {
  it("GOLEADA quando !wo e |dif| ≥ 3", () => {
    expect(seloDoResultado({ placar_1: 5, placar_2: 1 })).toBe("GOLEADA")
    expect(seloDoResultado({ placar_1: 0, placar_2: 3 })).toBe("GOLEADA")
  })

  it("sem selo quando |dif| < 3 e sem W.O.", () => {
    expect(seloDoResultado({ placar_1: 2, placar_2: 1 })).toBeNull()
    expect(seloDoResultado({ placar_1: 0, placar_2: 0 })).toBeNull()
  })

  it("W.O. simples (wo && !woDuplo) — nunca GOLEADA mesmo com placar", () => {
    expect(seloDoResultado({ wo: true, placar_1: 0, placar_2: 0 })).toBe("W.O.")
    // placar residual não deve virar GOLEADA quando é W.O.
    expect(seloDoResultado({ wo: true, placar_1: 4, placar_2: 0 })).toBe("W.O.")
  })

  it("W.O. DUPLO tem prioridade", () => {
    expect(
      seloDoResultado({ wo: true, woDuplo: true, placar_1: 0, placar_2: 0 })
    ).toBe("W.O. DUPLO")
  })
})

describe("projetarLadoPartida", () => {
  it("competitivo: usa o escudo do clube", () => {
    const p = partida({ escudo_1: "https://x/escudo.png" })
    expect(projetarLadoPartida(p, 1)).toEqual({
      nome: "A",
      imagemUrl: "https://x/escudo.png",
    })
  })

  it("avulso: cai na foto do participante quando não há escudo", () => {
    const p = partida({ escudo_2: null, avatarUrl_2: "https://x/foto.png" })
    expect(projetarLadoPartida(p, 2)).toEqual({
      nome: "B",
      imagemUrl: "https://x/foto.png",
    })
  })

  it("sem escudo nem foto ⇒ imagemUrl null (monograma no renderer)", () => {
    expect(projetarLadoPartida(partida(), 1).imagemUrl).toBeNull()
  })
})
