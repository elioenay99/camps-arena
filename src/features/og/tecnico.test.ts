import { describe, expect, it } from "vitest"

import { resumirTrofeus } from "@/features/og/tecnico"
import type { ConquistaTemporada } from "@/features/league/data/getConquistasDoCompetidor"

function conquista(tipos: string[]): ConquistaTemporada {
  return {
    refId: "r",
    rotulo: "x",
    conquistadoEm: "2026-01-01",
    trofeus: tipos.map((tipo) => ({
      tipo,
      nivel: null,
      valorTexto: null,
      valorNum: null,
      jogador: null,
    })),
  } as unknown as ConquistaTemporada
}

describe("resumirTrofeus", () => {
  it("agrega por tipo, na ordem de nobreza, filtrando total 0 e tipos fora da whitelist", () => {
    const conquistas = [
      conquista(["campeao", "promovido", "melhor_ataque"]),
      conquista(["campeao", "vice"]),
    ]
    expect(resumirTrofeus(conquistas)).toEqual([
      { label: "Títulos", total: 2 },
      { label: "Vices", total: 1 },
      { label: "Acessos", total: 1 },
    ])
  })

  it("conta artilharias quando presentes (ordem após acessos)", () => {
    expect(resumirTrofeus([conquista(["artilheiro", "artilheiro", "campeao"])])).toEqual([
      { label: "Títulos", total: 1 },
      { label: "Artilharias", total: 2 },
    ])
  })

  it("sem troféus relevantes ⇒ vazio", () => {
    expect(resumirTrofeus([])).toEqual([])
    expect(resumirTrofeus([conquista(["melhor_defesa", "melhor_sequencia"])])).toEqual([])
  })
})
