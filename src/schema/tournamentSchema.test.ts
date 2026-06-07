import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  createTournamentSchema,
  iniciarMataMataSchema,
  PONTOS_MAX,
  TORNEIO_MAX_CLUBES,
} from "@/schema/tournamentSchema"

const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/** Gera uuids v4 distintos e válidos para listas de clubes. */
const uuidDeIndice = (i: number) =>
  `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`

const PADRAO = {
  pontosVitoria: 3,
  pontosEmpate: 1,
  pontosDerrota: 0,
  formato: "avulso",
  idaEVolta: false,
  terceiroLugar: false,
  clubes: [],
}

describe("createTournamentSchema", () => {
  it("aceita título válido e usa defaults (público, 3/1/0, avulso)", () => {
    const r = createTournamentSchema.parse({ titulo: "Copa" })
    expect(r).toEqual({ titulo: "Copa", isPublic: true, ...PADRAO })
  })

  it("aplica trim no título", () => {
    const r = createTournamentSchema.parse({ titulo: "  Liga  ", isPublic: false })
    expect(r).toEqual({ titulo: "Liga", isPublic: false, ...PADRAO })
  })

  it("aceita formato liga com idaEVolta (com a lista de clubes obrigatória)", () => {
    const r = createTournamentSchema.parse({
      titulo: "Liga",
      formato: "liga",
      idaEVolta: true,
      clubes: [UUID_A, UUID_B],
    })
    expect(r.formato).toBe("liga")
    expect(r.idaEVolta).toBe(true)
    expect(r.clubes).toEqual([UUID_A, UUID_B])
  })

  it("aceita formato mata_mata com terceiroLugar (opção exclusiva do mata-mata)", () => {
    const r = createTournamentSchema.parse({
      titulo: "Copa",
      formato: "mata_mata",
      terceiroLugar: true,
      clubes: [UUID_A, UUID_B],
    })
    expect(r.formato).toBe("mata_mata")
    expect(r.terceiroLugar).toBe(true)
  })

  it("rejeita formato fora do enum", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", formato: "mata-mata" })
        .success
    ).toBe(false)
  })

  it("idaEVolta é estrito (boolean), não coage 'on'/string", () => {
    expect(
      createTournamentSchema.safeParse({ titulo: "Copa", idaEVolta: "on" }).success
    ).toBe(false)
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

  describe("clubes (modelo clube-cêntrico)", () => {
    it("competitivo SEM clubes (ou com 1 só) é rejeitado apontando o campo", () => {
      for (const clubes of [undefined, [], [UUID_A]]) {
        const r = createTournamentSchema.safeParse({
          titulo: "Liga",
          formato: "liga",
          ...(clubes !== undefined ? { clubes } : {}),
        })
        expect(r.success).toBe(false)
        if (!r.success) {
          expect(z.flattenError(r.error).fieldErrors.clubes).toBeTruthy()
        }
      }
    })

    it("a exigência vale para TODOS os formatos competitivos", () => {
      for (const formato of ["liga", "mata_mata", "grupos_mata_mata", "fase_liga"]) {
        expect(
          createTournamentSchema.safeParse({ titulo: "Copa", formato }).success
        ).toBe(false)
      }
    })

    it("avulso ignora clubes: lista vazia ou ausente passa", () => {
      expect(createTournamentSchema.safeParse({ titulo: "Copa" }).success).toBe(true)
      expect(
        createTournamentSchema.safeParse({ titulo: "Copa", clubes: [] }).success
      ).toBe(true)
    })

    it("rejeita clube repetido na seleção", () => {
      const r = createTournamentSchema.safeParse({
        titulo: "Liga",
        formato: "liga",
        clubes: [UUID_A, UUID_A],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(z.flattenError(r.error).fieldErrors.clubes).toBeTruthy()
      }
    })

    it("rejeita id que não é uuid", () => {
      expect(
        createTournamentSchema.safeParse({
          titulo: "Liga",
          formato: "liga",
          clubes: [UUID_A, "lixo"],
        }).success
      ).toBe(false)
    })

    it("LIGA tem teto próprio (motor aceita menos que o teto geral): 20 passa, 21 rejeita", () => {
      // Vagas não são removíveis pós-criação — sem este gate, uma liga com
      // 21+ clubes nasceria travada (iniciarTorneio rejeita > 20).
      const clubes = (n: number) => Array.from({ length: n }, (_, i) => uuidDeIndice(i))
      expect(
        createTournamentSchema.safeParse({
          titulo: "Liga",
          formato: "liga",
          clubes: clubes(20),
        }).success
      ).toBe(true)
      const r = createTournamentSchema.safeParse({
        titulo: "Liga",
        formato: "liga",
        clubes: clubes(21),
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(z.flattenError(r.error).fieldErrors.clubes?.[0]).toMatch(/máximo 20/)
      }
      // Os demais formatos seguem o teto geral: 21 clubes passam no mata-mata.
      expect(
        createTournamentSchema.safeParse({
          titulo: "Copa",
          formato: "mata_mata",
          clubes: clubes(21),
        }).success
      ).toBe(true)
    })

    it("aceita o teto exato e rejeita acima (TORNEIO_MAX_CLUBES)", () => {
      const noTeto = Array.from({ length: TORNEIO_MAX_CLUBES }, (_, i) =>
        uuidDeIndice(i)
      )
      expect(
        createTournamentSchema.safeParse({
          titulo: "Copa",
          formato: "mata_mata",
          clubes: noTeto,
        }).success
      ).toBe(true)
      expect(
        createTournamentSchema.safeParse({
          titulo: "Copa",
          formato: "mata_mata",
          clubes: [...noTeto, uuidDeIndice(TORNEIO_MAX_CLUBES)],
        }).success
      ).toBe(false)
    })
  })
})

describe("iniciarMataMataSchema", () => {
  it("valida o modo sorteio e aplica defaults vazios em cabecas/confrontos", () => {
    const r = iniciarMataMataSchema.parse({ tournamentId: UUID_A, modo: "sorteio" })
    expect(r).toEqual({
      tournamentId: UUID_A,
      modo: "sorteio",
      cabecas: [],
      confrontos: [],
    })
  })

  it("rejeita modo de chaveamento fora do enum", () => {
    expect(
      iniciarMataMataSchema.safeParse({ tournamentId: UUID_A, modo: "chaveio" }).success
    ).toBe(false)
  })

  it("rejeita tournamentId que não é uuid", () => {
    expect(
      iniciarMataMataSchema.safeParse({ tournamentId: "nao-uuid", modo: "sorteio" })
        .success
    ).toBe(false)
  })

  it("rejeita cabeça de chave que não é uuid (modo potes)", () => {
    expect(
      iniciarMataMataSchema.safeParse({
        tournamentId: UUID_A,
        modo: "potes",
        cabecas: [UUID_B, "lixo"],
      }).success
    ).toBe(false)
  })

  it("aceita confrontos como tuplas [uuid|null, uuid|null] (modo manual, com bye)", () => {
    const r = iniciarMataMataSchema.parse({
      tournamentId: UUID_A,
      modo: "manual",
      confrontos: [
        [UUID_A, UUID_B],
        [UUID_A, null],
        [null, null],
      ],
    })
    expect(r.confrontos).toEqual([
      [UUID_A, UUID_B],
      [UUID_A, null],
      [null, null],
    ])
  })
})
