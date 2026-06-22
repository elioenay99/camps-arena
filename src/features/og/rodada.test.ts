import { describe, expect, it } from "vitest"

import { alturaDaRodada } from "./rodada"

describe("alturaDaRodada", () => {
  it("respeita o piso de 1080 em rodadas pequenas (≤4 jogos)", () => {
    expect(alturaDaRodada(0, false)).toBe(1080)
    expect(alturaDaRodada(1, false)).toBe(1080)
    // n=4 é o limiar: conteúdo cru (1065) ainda fica sob o piso → 1080.
    expect(alturaDaRodada(4, false)).toBe(1080)
  })

  it("cresce acima do piso a partir de 5 jogos", () => {
    // 385 (cabeçalho) + 5*128 + 4*14 + 126 (rodapé) = 1207
    expect(alturaDaRodada(5, false)).toBe(1207)
    // 10 jogos (Brasileirão): 385 + 10*128 + 9*14 + 126 = 1917
    expect(alturaDaRodada(10, false)).toBe(1917)
  })

  it("cobre o teto (MAX_LINHAS=20) — maior altura que vai a produção", () => {
    // 20 confrontos: 385 + 20*128 + 19*14 + 126 = 3337
    expect(alturaDaRodada(20, false)).toBe(3337)
    // 20 visíveis + faixa "+N confrontos": 3337 + 48 = 3385
    expect(alturaDaRodada(20, true)).toBe(3385)
  })

  it("é monotonicamente crescente no nº de confrontos", () => {
    for (let n = 0; n < 20; n++) {
      expect(alturaDaRodada(n + 1, false)).toBeGreaterThanOrEqual(alturaDaRodada(n, false))
    }
  })

  it("soma a faixa '+N confrontos' (48px) quando há restantes, acima do piso", () => {
    expect(alturaDaRodada(10, true) - alturaDaRodada(10, false)).toBe(48)
    // No piso, o acréscimo de restantes não ultrapassa 1080 → sem efeito.
    expect(alturaDaRodada(1, true)).toBe(1080)
  })
})
