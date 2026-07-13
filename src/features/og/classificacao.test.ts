import { describe, expect, it } from "vitest"

import {
  alturaDaClassificacao,
  corDaZona,
} from "@/features/og/classificacao"
import { OURO, VERDE, VERMELHO } from "@/features/og/compartilhado"
import type { Zonas } from "@/features/league/data/getDivisionStandings"

describe("alturaDaClassificacao", () => {
  it("tabelas pequenas ficam no piso quadrado (1080)", () => {
    expect(alturaDaClassificacao(1, false)).toBe(1080)
    expect(alturaDaClassificacao(4, false)).toBe(1080)
  })

  it("cresce com o número de linhas (liga de 20)", () => {
    expect(alturaDaClassificacao(20, false)).toBeGreaterThan(1080)
  })

  it("é monotônica em n", () => {
    expect(alturaDaClassificacao(20, false)).toBeGreaterThan(
      alturaDaClassificacao(10, false)
    )
  })

  it("o '+N' acrescenta uma faixa fixa de altura", () => {
    expect(alturaDaClassificacao(20, true)).toBe(
      alturaDaClassificacao(20, false) + 52
    )
  })
})

describe("corDaZona", () => {
  const zonas: Zonas = {
    acesso: [1, 2],
    rebaixamento: [19, 20],
    playoffAcesso: [3],
    playoffRebaixamento: [17],
  }

  it("acesso → verde", () => {
    expect(corDaZona(1, zonas)).toBe(VERDE)
    expect(corDaZona(2, zonas)).toBe(VERDE)
  })

  it("rebaixamento → vermelho", () => {
    expect(corDaZona(20, zonas)).toBe(VERMELHO)
  })

  it("playoff (acesso ou rebaixamento) → ouro", () => {
    expect(corDaZona(3, zonas)).toBe(OURO)
    expect(corDaZona(17, zonas)).toBe(OURO)
  })

  it("fora de zona → null; sem zonas → null", () => {
    expect(corDaZona(10, zonas)).toBeNull()
    expect(corDaZona(5, undefined)).toBeNull()
  })
})
