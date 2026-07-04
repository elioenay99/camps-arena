import { describe, expect, it } from "vitest"

/**
 * Espelho conceitual da CHECK `matches_wo_coerente` (`supabase/schema.sql`) — a
 * DDL não roda no vitest (hermético), então validamos o CONTRATO das três formas
 * coerentes numa réplica pura do predicado. Guarda contra regressão do desenho
 * (ex.: alguém relaxar um ramo). A barreira REAL é o banco; este teste documenta.
 */
interface LinhaWo {
  wo: boolean
  wo_duplo: boolean
  wo_vencedor: string | null
  status: string
  placar_1: number
  placar_2: number
  posicao: number | null
  vaga_1: string | null
  vaga_2: string | null
}

/** Réplica do predicado da CHECK (3 ramos mutuamente exclusivos). */
function matchesWoCoerente(m: LinhaWo): boolean {
  const foraDeWo = m.wo === false && m.wo_vencedor === null && m.wo_duplo === false
  const woSimples =
    m.wo === true &&
    m.wo_duplo === false &&
    m.status === "encerrada" &&
    m.wo_vencedor !== null &&
    m.placar_1 === 0 &&
    m.placar_2 === 0 &&
    (m.wo_vencedor === m.vaga_1 || m.wo_vencedor === m.vaga_2)
  const duplo =
    m.wo === true &&
    m.wo_duplo === true &&
    m.status === "encerrada" &&
    m.wo_vencedor === null &&
    m.placar_1 === 0 &&
    m.placar_2 === 0 &&
    m.posicao === null &&
    m.vaga_1 !== null &&
    m.vaga_2 !== null
  return foraDeWo || woSimples || duplo
}

const base: LinhaWo = {
  wo: false,
  wo_duplo: false,
  wo_vencedor: null,
  status: "agendada",
  placar_1: 0,
  placar_2: 0,
  posicao: null,
  vaga_1: "v1",
  vaga_2: "v2",
}

describe("matches_wo_coerente (contrato conceitual)", () => {
  it("fora de W.O. é válido (wo falso, sem vencedor, wo_duplo falso)", () => {
    expect(matchesWoCoerente(base)).toBe(true)
    expect(matchesWoCoerente({ ...base, status: "encerrada", placar_1: 2, placar_2: 1 })).toBe(true)
  })

  it("W.O. simples é válido (vencedor entre as vagas, 0x0, encerrada, wo_duplo falso)", () => {
    expect(
      matchesWoCoerente({
        ...base,
        wo: true,
        status: "encerrada",
        wo_vencedor: "v1",
      })
    ).toBe(true)
  })

  it("duplo W.O. FORA de chave (posicao nula, ambos os lados) é válido", () => {
    expect(
      matchesWoCoerente({
        ...base,
        wo: true,
        wo_duplo: true,
        status: "encerrada",
        wo_vencedor: null,
      })
    ).toBe(true)
  })

  it("duplo W.O. EM chave (posicao não nula) é INVÁLIDO", () => {
    expect(
      matchesWoCoerente({
        ...base,
        wo: true,
        wo_duplo: true,
        status: "encerrada",
        wo_vencedor: null,
        posicao: 1,
      })
    ).toBe(false)
  })

  it("duplo W.O. com vencedor não-nulo é INVÁLIDO", () => {
    expect(
      matchesWoCoerente({
        ...base,
        wo: true,
        wo_duplo: true,
        status: "encerrada",
        wo_vencedor: "v1",
      })
    ).toBe(false)
  })

  it("duplo W.O. com um lado ausente (bye) é INVÁLIDO", () => {
    expect(
      matchesWoCoerente({
        ...base,
        wo: true,
        wo_duplo: true,
        status: "encerrada",
        wo_vencedor: null,
        vaga_2: null,
      })
    ).toBe(false)
  })

  it("W.O. com placar não-zerado é INVÁLIDO (simples e duplo)", () => {
    expect(
      matchesWoCoerente({ ...base, wo: true, status: "encerrada", wo_vencedor: "v1", placar_1: 1 })
    ).toBe(false)
    expect(
      matchesWoCoerente({
        ...base,
        wo: true,
        wo_duplo: true,
        status: "encerrada",
        wo_vencedor: null,
        placar_2: 3,
      })
    ).toBe(false)
  })
})
