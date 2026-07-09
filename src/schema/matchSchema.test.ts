import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  agregarAutores,
  chaveAutor,
  createMatchSchema,
  PLACAR_MAX,
  proporPlacarSchema,
  registrarAutoresLadoSchema,
  updateMatchScoreSchema,
} from "@/schema/matchSchema"

const UUID = "11111111-1111-4111-8111-111111111111"

describe("updateMatchScoreSchema", () => {
  it("aceita entrada válida", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: 3,
      placar_2: 1,
    })
    expect(r.success).toBe(true)
  })

  it("aceita os limites 0 e PLACAR_MAX", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: 0,
      placar_2: PLACAR_MAX,
    })
    expect(r.success).toBe(true)
  })

  it("rejeita placar negativo", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: -1,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita placar não-inteiro", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: 2.5,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita placar acima do teto", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: PLACAR_MAX + 1,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita matchId que não é uuid", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: "nao-e-uuid",
      placar_1: 0,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  // Endurecimento (auditoria Fase 4): sem z.coerce, lixo não vira placar.
  it("rejeita string numérica como placar (sem coerção)", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: "5",
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita string vazia (regressão do coerce '' -> 0)", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: "",
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita null como placar", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: null,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita NaN como placar", () => {
    const r = updateMatchScoreSchema.safeParse({
      matchId: UUID,
      placar_1: Number.NaN,
      placar_2: 0,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita quando falta um placar", () => {
    const r = updateMatchScoreSchema.safeParse({ matchId: UUID, placar_1: 1 })
    expect(r.success).toBe(false)
  })
})

describe("autores dos gols (updateMatchScoreSchema + proporPlacarSchema)", () => {
  const base = { matchId: UUID, placar_1: 2, placar_2: 1 }

  it("aceita ausência de autores (retrocompat)", () => {
    expect(updateMatchScoreSchema.safeParse(base).success).toBe(true)
  })

  it("aceita lista vazia de autores", () => {
    expect(
      updateMatchScoreSchema.safeParse({ ...base, autores: [] }).success
    ).toBe(true)
  })

  it("aceita autores coerentes (soma por lado ≤ placar)", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [
        { lado: 1, jogador: "Endrick", gols: 2 },
        { lado: 2, jogador: "João", gols: 1 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("aceita menos gols atribuídos que o placar (autor parcial)", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [{ lado: 1, jogador: "Endrick", gols: 1 }],
    })
    expect(r.success).toBe(true)
  })

  it("faz trim do nome do autor", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [{ lado: 1, jogador: "  Endrick  ", gols: 2 }],
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.autores?.[0].jogador).toBe("Endrick")
  })

  it("rejeita quando a soma por lado excede o placar daquele lado", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 1,
      autores: [{ lado: 1, jogador: "Endrick", gols: 2 }],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(z.flattenError(r.error).fieldErrors.autores).toBeTruthy()
    }
  })

  it("rejeita autor duplicado no mesmo lado (case-insensitive)", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [
        { lado: 1, jogador: "Endrick", gols: 1 },
        { lado: 1, jogador: "endrick", gols: 1 },
      ],
    })
    expect(r.success).toBe(false)
  })

  it("aceita o mesmo nome em lados diferentes", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [
        { lado: 1, jogador: "Silva", gols: 1 },
        { lado: 2, jogador: "Silva", gols: 1 },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("rejeita nome vazio", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [{ lado: 1, jogador: "   ", gols: 1 }],
    })
    expect(r.success).toBe(false)
  })

  it("rejeita nome acima de 60 caracteres", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [{ lado: 1, jogador: "a".repeat(61), gols: 1 }],
    })
    expect(r.success).toBe(false)
  })

  it("rejeita gols abaixo de 1 ou acima de 99", () => {
    expect(
      updateMatchScoreSchema.safeParse({
        ...base,
        autores: [{ lado: 1, jogador: "X", gols: 0 }],
      }).success
    ).toBe(false)
    expect(
      updateMatchScoreSchema.safeParse({
        ...base,
        placar_1: 100,
        placar_2: 0,
        autores: [{ lado: 1, jogador: "X", gols: 100 }],
      }).success
    ).toBe(false)
  })

  it("rejeita lado fora de {1,2}", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      autores: [{ lado: 3, jogador: "X", gols: 1 }],
    })
    expect(r.success).toBe(false)
  })

  it("proporPlacarSchema aplica a mesma validação de autores", () => {
    expect(
      proporPlacarSchema.safeParse({
        ...base,
        autores: [{ lado: 1, jogador: "Endrick", gols: 2 }],
      }).success
    ).toBe(true)
    expect(
      proporPlacarSchema.safeParse({
        ...base,
        placar_1: 1,
        autores: [{ lado: 1, jogador: "Endrick", gols: 2 }],
      }).success
    ).toBe(false)
  })

  it("aceita gol contra sem jogador (fecha a conta do lado)", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 4,
      placar_2: 0,
      autores: [
        { lado: 1, jogador: "Vini", gols: 3 },
        { lado: 1, gols: 1, contra: true },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("rejeita gol NORMAL sem jogador", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 1,
      autores: [{ lado: 1, gols: 1, contra: false }],
    })
    expect(r.success).toBe(false)
  })

  it("rejeita gol contra NOMEADO acima de 60 caracteres", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 1,
      autores: [{ lado: 1, jogador: "a".repeat(61), gols: 1, contra: true }],
    })
    expect(r.success).toBe(false)
  })

  it("o teto do lado conta gols normais E gols contra", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 1,
      placar_2: 0,
      autores: [
        { lado: 1, jogador: "Vini", gols: 1 },
        { lado: 1, gols: 1, contra: true },
      ],
    })
    expect(r.success).toBe(false)
  })

  it("um Endrick normal e um Endrick contra no mesmo lado NÃO são duplicata", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 3,
      placar_2: 0,
      autores: [
        { lado: 1, jogador: "Endrick", gols: 2, contra: false },
        { lado: 1, jogador: "Endrick", gols: 1, contra: true },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("dois gols contra anônimos no mesmo lado são duplicata", () => {
    const r = updateMatchScoreSchema.safeParse({
      ...base,
      placar_1: 2,
      placar_2: 0,
      autores: [
        { lado: 1, gols: 1, contra: true },
        { lado: 1, gols: 1, contra: true },
      ],
    })
    expect(r.success).toBe(false)
  })
})

describe("registrarAutoresLadoSchema", () => {
  const MID = "11111111-1111-4111-8111-111111111111"

  it("aceita append/replace com autores válidos", () => {
    expect(
      registrarAutoresLadoSchema.safeParse({
        matchId: MID,
        lado: 1,
        autores: [{ jogador: "Vini", gols: 2 }],
        modo: "append",
      }).success
    ).toBe(true)
    expect(
      registrarAutoresLadoSchema.safeParse({
        matchId: MID,
        lado: 2,
        autores: [{ gols: 1, contra: true }],
        modo: "replace",
      }).success
    ).toBe(true)
  })

  it("aceita lista vazia (replace esvazia o lado)", () => {
    expect(
      registrarAutoresLadoSchema.safeParse({
        matchId: MID,
        lado: 1,
        autores: [],
        modo: "replace",
      }).success
    ).toBe(true)
  })

  it("rejeita modo fora de {append, replace}", () => {
    expect(
      registrarAutoresLadoSchema.safeParse({
        matchId: MID,
        lado: 1,
        autores: [{ jogador: "X", gols: 1 }],
        modo: "sobrescrever",
      }).success
    ).toBe(false)
  })

  it("rejeita gol normal sem jogador; aceita gol contra sem jogador", () => {
    expect(
      registrarAutoresLadoSchema.safeParse({
        matchId: MID,
        lado: 1,
        autores: [{ gols: 1, contra: false }],
        modo: "append",
      }).success
    ).toBe(false)
    expect(
      registrarAutoresLadoSchema.safeParse({
        matchId: MID,
        lado: 1,
        autores: [{ gols: 1, contra: true }],
        modo: "append",
      }).success
    ).toBe(true)
  })
})

describe("agregarAutores (robustez do fluxo direto vs índice único do banco)", () => {
  it("colapsa nomes que só diferem em caixa/espaço numa linha só, somando os gols", () => {
    const r = agregarAutores([
      { lado: 1, jogador: "Endrick", gols: 1, contra: false },
      { lado: 1, jogador: "  endrick ", gols: 2, contra: false },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ lado: 1, jogador: "Endrick", gols: 3, contra: false })
  })

  it("mantém o mesmo nome em lados diferentes como linhas distintas", () => {
    const r = agregarAutores([
      { lado: 1, jogador: "Silva", gols: 1, contra: false },
      { lado: 2, jogador: "Silva", gols: 1, contra: false },
    ])
    expect(r).toHaveLength(2)
    expect(r.map((a) => a.lado).sort()).toEqual([1, 2])
  })

  it("preserva a primeira grafia vista e não repete chaves", () => {
    const r = agregarAutores([
      { lado: 2, jogador: "Raphinha", gols: 1, contra: false },
      { lado: 2, jogador: "RAPHINHA", gols: 1, contra: false },
      { lado: 2, jogador: "raphinha", gols: 1, contra: false },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ lado: 2, jogador: "Raphinha", gols: 3, contra: false })
  })

  it("gol normal e gol contra do mesmo nome no mesmo lado são buckets distintos", () => {
    const r = agregarAutores([
      { lado: 1, jogador: "Endrick", gols: 2, contra: false },
      { lado: 1, jogador: "Endrick", gols: 1, contra: true },
    ])
    expect(r).toHaveLength(2)
    expect(r.find((a) => a.contra)).toEqual({ lado: 1, jogador: "Endrick", gols: 1, contra: true })
    expect(r.find((a) => !a.contra)).toEqual({ lado: 1, jogador: "Endrick", gols: 2, contra: false })
  })

  it("dois gols contra anônimos no mesmo lado somam numa linha (jogador undefined)", () => {
    const r = agregarAutores([
      { lado: 2, jogador: "", gols: 1, contra: true },
      { lado: 2, gols: 1, contra: true },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ lado: 2, jogador: undefined, gols: 2, contra: true })
  })

  it("chaveAutor espelha lower(btrim()) do índice único e separa por contra", () => {
    expect(chaveAutor(1, "  Neymar Jr ", false)).toBe(chaveAutor(1, "neymar jr", false))
    expect(chaveAutor(1, "Neymar", false)).not.toBe(chaveAutor(2, "Neymar", false))
    expect(chaveAutor(1, "Neymar", false)).not.toBe(chaveAutor(1, "Neymar", true))
    expect(chaveAutor(1, undefined, true)).toBe(chaveAutor(1, "", true))
  })

  it("lista vazia agrega para vazia", () => {
    expect(agregarAutores([])).toEqual([])
  })
})

describe("createMatchSchema", () => {
  const P1 = "22222222-2222-4222-8222-222222222222"
  const P2 = "33333333-3333-4333-8333-333333333333"

  it("aceita torneio válido com participantes nulos", () => {
    const r = createMatchSchema.safeParse({
      tournamentId: UUID,
      participante1: null,
      participante2: null,
    })
    expect(r.success).toBe(true)
  })

  it("aceita participantes distintos", () => {
    const r = createMatchSchema.safeParse({
      tournamentId: UUID,
      participante1: P1,
      participante2: P2,
    })
    expect(r.success).toBe(true)
  })

  it("aceita um único participante (qualquer lado)", () => {
    expect(
      createMatchSchema.safeParse({
        tournamentId: UUID,
        participante1: P1,
        participante2: null,
      }).success
    ).toBe(true)
    expect(
      createMatchSchema.safeParse({
        tournamentId: UUID,
        participante1: null,
        participante2: P2,
      }).success
    ).toBe(true)
  })

  it("rejeita o mesmo participante nos dois lados, apontando participante2", () => {
    const r = createMatchSchema.safeParse({
      tournamentId: UUID,
      participante1: P1,
      participante2: P1,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      // O erro aponta o CAMPO certo — é o que o form usa para destacar.
      expect(z.flattenError(r.error).fieldErrors.participante2).toBeTruthy()
    }
  })

  it("rejeita tournamentId que não é uuid", () => {
    const r = createMatchSchema.safeParse({
      tournamentId: "abc",
      participante1: null,
      participante2: null,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita participante que não é uuid (sem coerção de '')", () => {
    const r = createMatchSchema.safeParse({
      tournamentId: UUID,
      participante1: "",
      participante2: null,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita undefined nos participantes (campo é explícito, anulável)", () => {
    const r = createMatchSchema.safeParse({ tournamentId: UUID })
    expect(r.success).toBe(false)
  })
})
