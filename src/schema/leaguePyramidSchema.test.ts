import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  createCompetitionSchema,
  PRESET_BRASILEIRAO,
  PRESET_PREMIER,
  PRESET_PERSONALIZADO,
} from "@/schema/leaguePyramidSchema"

/** Gera uuids v4 distintos e válidos para times. */
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`

let contadorClube = 0
/** Competidor modo clube com id único (evita falso-positivo de "clube repetido"). */
const clube = (nome = "Clube") => ({ teamId: uuid(contadorClube++), nome })

/** Lista de N clubes únicos. */
const clubes = (n: number) => Array.from({ length: n }, (_, i) => clube(`Clube ${i}`))

/** Competidor modo nome. */
const nome = (rotulo: string) => ({ rotulo })

/** Lista de N nomes únicos. */
const nomes = (n: number) => Array.from({ length: n }, (_, i) => nome(`Time ${i}`))

/**
 * Monta uma divisão por clube já com `competidores` no tamanho exato (default
 * que satisfaz a invariante "exatamente `tamanho` competidores").
 */
const divisao = (
  nivel: number,
  tamanho: number,
  extra: Partial<{ porNome: boolean; desempate: "cbf" | "ingles"; nome: string }> = {}
) => {
  const porNome = extra.porNome ?? false
  return {
    nivel,
    nome: extra.nome ?? `Divisão ${nivel}`,
    porNome,
    desempate: extra.desempate ?? "cbf",
    tamanho,
    competidores: porNome ? nomes(tamanho) : clubes(tamanho),
  }
}

describe("createCompetitionSchema", () => {
  it("aceita uma pirâmide válida no esqueleto Brasileirão (2 divisões, 4 sobem/4 caem)", () => {
    const v = PRESET_BRASILEIRAO.vagasPorFronteira
    const r = createCompetitionSchema.safeParse({
      nome: "Brasileirão Fantasy",
      divisoes: [
        divisao(1, 20, { desempate: PRESET_BRASILEIRAO.desempate }),
        divisao(2, 20, { desempate: PRESET_BRASILEIRAO.desempate }),
      ],
      fronteiras: [
        { nivelSuperior: 1, vagasAcesso: v, vagasRebaixamento: v, modo: "direto" },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.isPublic).toBe(true) // default
      expect(r.data.divisoes).toHaveLength(2)
    }
  })

  it("aceita o esqueleto Premier (3 sobem/3 caem, desempate inglês)", () => {
    const v = PRESET_PREMIER.vagasPorFronteira
    const r = createCompetitionSchema.safeParse({
      nome: "Premier Fantasy",
      divisoes: [
        divisao(1, 20, { desempate: PRESET_PREMIER.desempate }),
        divisao(2, 18, { desempate: PRESET_PREMIER.desempate }),
      ],
      fronteiras: [
        { nivelSuperior: 1, vagasAcesso: v, vagasRebaixamento: v, modo: "direto" },
      ],
    })
    expect(r.success).toBe(true)
  })

  it("expõe os presets esperados (Brasileirão 4/4, Premier 3/3, personalizado)", () => {
    expect(PRESET_BRASILEIRAO.vagasPorFronteira).toBe(4)
    expect(PRESET_PREMIER.vagasPorFronteira).toBe(3)
    expect(PRESET_PERSONALIZADO).toBe("personalizado")
  })

  describe("continuidade de níveis (1..N)", () => {
    it("rejeita nível com buraco (1 e 3, faltando 2)", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Furada",
        divisoes: [divisao(1, 20), divisao(3, 20)],
        fronteiras: [],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        const fe = z.flattenError(r.error).fieldErrors as Record<string, unknown>
        // O erro de continuidade aponta o campo de nível de alguma divisão.
        expect(
          r.error.issues.some(
            (i) => i.path.includes("nivel") && /contínuos/.test(i.message)
          )
        ).toBe(true)
        expect(fe).toBeTruthy()
      }
    })

    it("rejeita nível duplicado", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Dupla",
        divisoes: [divisao(1, 20), divisao(1, 20)],
        fronteiras: [],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some((i) => /repetido/.test(i.message))
        ).toBe(true)
      }
    })
  })

  describe("fronteiras", () => {
    it("rejeita fronteira entre níveis não adjacentes/inexistentes (nível 2 numa pirâmide N=2)", () => {
      // nivelSuperior=2 implicaria divisão de nível 3 (inexistente).
      const r = createCompetitionSchema.safeParse({
        nome: "Sem vizinha",
        divisoes: [divisao(1, 20), divisao(2, 20)],
        fronteiras: [
          { nivelSuperior: 2, vagasAcesso: 1, vagasRebaixamento: 1, modo: "direto" },
        ],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues.some((i) => /adjacentes/.test(i.message))).toBe(true)
      }
    })

    it("rejeita duas fronteiras para o mesmo par de níveis", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Dupla fronteira",
        divisoes: [divisao(1, 20), divisao(2, 20)],
        fronteiras: [
          { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1, modo: "direto" },
          { nivelSuperior: 1, vagasAcesso: 2, vagasRebaixamento: 2, modo: "direto" },
        ],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some((i) => /Já existe uma fronteira/.test(i.message))
        ).toBe(true)
      }
    })

    it("rejeita modo de fronteira diferente de 'direto' (Fase 1)", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Playoff cedo",
        divisoes: [divisao(1, 20), divisao(2, 20)],
        fronteiras: [
          { nivelSuperior: 1, vagasAcesso: 2, vagasRebaixamento: 2, modo: "playoff_acesso" },
        ],
      })
      expect(r.success).toBe(false)
    })

    it("rejeita fronteira ASSIMÉTRICA (sobe != cai) na Fase 1", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Assimétrica",
        divisoes: [divisao(1, 20), divisao(2, 20)],
        fronteiras: [
          { nivelSuperior: 1, vagasAcesso: 4, vagasRebaixamento: 2, modo: "direto" },
        ],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some((i) => /mesmo número/.test(i.message))
        ).toBe(true)
      }
    })

    it("aceita fronteira simétrica (sobe == cai)", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Simétrica",
        divisoes: [divisao(1, 20), divisao(2, 20)],
        fronteiras: [
          { nivelSuperior: 1, vagasAcesso: 3, vagasRebaixamento: 3, modo: "direto" },
        ],
      })
      expect(r.success).toBe(true)
    })
  })

  describe("conservação de tamanho (pirâmide de 3 divisões)", () => {
    // Topo (d1) recebe de baixo (acesso de d2) e perde para baixo (rebaixa para
    // d2). Meio (d2) recebe de cima (rebaixados de d1) e de baixo (acesso de d3),
    // e perde para ambos. Base (d3) recebe de cima e perde para cima.
    const piramide3 = (
      tamanhos: [number, number, number],
      f12: { acesso: number; rebaixa: number },
      f23: { acesso: number; rebaixa: number }
    ) => ({
      nome: "Pirâmide 3",
      divisoes: [
        divisao(1, tamanhos[0]),
        divisao(2, tamanhos[1]),
        divisao(3, tamanhos[2]),
      ],
      fronteiras: [
        { nivelSuperior: 1, vagasAcesso: f12.acesso, vagasRebaixamento: f12.rebaixa, modo: "direto" as const },
        { nivelSuperior: 2, vagasAcesso: f23.acesso, vagasRebaixamento: f23.rebaixa, modo: "direto" as const },
      ],
    })

    it("aceita fronteiras simétricas (sobe == cai → tamanho conservado em todas)", () => {
      const r = createCompetitionSchema.safeParse(
        piramide3([20, 20, 20], { acesso: 4, rebaixa: 4 }, { acesso: 4, rebaixa: 4 })
      )
      expect(r.success).toBe(true)
    })

    it("REJEITA config cuja conservação ESTOURA 20 numa divisão", () => {
      // d2: pos = 20 - sobe(d2→d1: acesso f12=2) - cai(d2→d3: rebaixa f23=2)
      //          + recebeDeCima(rebaixados de d1: rebaixa f12=10)
      //          + recebeDeBaixo(acesso de d3: acesso f23=2)
      //        = 20 - 2 - 2 + 10 + 2 = 28 > 20 → rejeita
      const r = createCompetitionSchema.safeParse(
        piramide3([20, 20, 20], { acesso: 2, rebaixa: 10 }, { acesso: 2, rebaixa: 2 })
      )
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some(
            (i) => i.path.includes("tamanho") && /máximo é 20/.test(i.message)
          )
        ).toBe(true)
      }
    })

    it("REJEITA config cuja conservação CAI ABAIXO de 2 numa divisão", () => {
      // d2 tamanho 4: pos = 4 - sobe(acesso f12=3) - cai(rebaixa f23=0)
      //                    + recebeDeCima(rebaixa f12=0) + recebeDeBaixo(acesso f23=0)
      //                  = 4 - 3 - 0 + 0 + 0 = 1 < 2 → rejeita
      const r = createCompetitionSchema.safeParse(
        piramide3([20, 4, 20], { acesso: 3, rebaixa: 0 }, { acesso: 0, rebaixa: 0 })
      )
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some(
            (i) => i.path.includes("tamanho") && /mínimo é 2/.test(i.message)
          )
        ).toBe(true)
      }
    })

    it("REJEITA movimento físico impossível (sobe + cai > tamanho da divisão)", () => {
      // d2 tem 2 competidores mas 2 sobem (f12) E 2 caem (f23) = 4 movimentos
      // sobre 2 entidades. O FECHAMENTO ainda daria 2 (2-2-2+2+2), enganando a
      // checagem [2,20]; a regra física barra antes.
      const r = createCompetitionSchema.safeParse(
        piramide3([4, 2, 4], { acesso: 2, rebaixa: 2 }, { acesso: 2, rebaixa: 2 })
      )
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some(
            (i) =>
              i.path.includes("tamanho") &&
              /não pode promover e rebaixar/.test(i.message)
          )
        ).toBe(true)
      }
    })
  })

  describe("N=1 (pirâmide de uma divisão)", () => {
    it("aceita uma única divisão sem fronteiras", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Liga única",
        divisoes: [divisao(1, 12)],
        fronteiras: [],
      })
      expect(r.success).toBe(true)
    })

    it("aceita N=1 com fronteiras default ausentes", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Liga única",
        divisoes: [divisao(1, 8)],
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.fronteiras).toEqual([])
    })
  })

  describe("modo × competidor incompatível", () => {
    it("rejeita clube numa divisão por nome", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Modo trocado",
        divisoes: [
          {
            nivel: 1,
            nome: "Série A",
            porNome: true, // por nome…
            desempate: "cbf",
            tamanho: 2,
            competidores: [clube("Real"), clube("Barça")], // …mas vieram clubes
          },
        ],
        fronteiras: [],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues.some((i) => /por nome/.test(i.message))).toBe(true)
      }
    })

    it("rejeita nome livre numa divisão por clube", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Modo trocado",
        divisoes: [
          {
            nivel: 1,
            nome: "Série A",
            porNome: false, // por clube…
            desempate: "cbf",
            tamanho: 2,
            competidores: [nome("João"), nome("Maria")], // …mas vieram nomes
          },
        ],
        fronteiras: [],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues.some((i) => /por clube/.test(i.message))).toBe(true)
      }
    })

    it("aceita divisão por nome com rótulos corretos", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Por nome ok",
        divisoes: [divisao(1, 6, { porNome: true })],
        fronteiras: [],
      })
      expect(r.success).toBe(true)
    })
  })

  describe("tamanho × contagem de competidores", () => {
    it("rejeita divisão com competidores a menos que o tamanho", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Faltam clubes",
        divisoes: [
          { nivel: 1, nome: "A", porNome: false, desempate: "cbf", tamanho: 4, competidores: clubes(3) },
        ],
        fronteiras: [],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(
          r.error.issues.some((i) => i.path.includes("competidores"))
        ).toBe(true)
      }
    })

    it("rejeita tamanho fora de [2,20]", () => {
      expect(
        createCompetitionSchema.safeParse({
          nome: "Pequena",
          divisoes: [{ nivel: 1, nome: "A", porNome: false, desempate: "cbf", tamanho: 1, competidores: clubes(1) }],
          fronteiras: [],
        }).success
      ).toBe(false)
      expect(
        createCompetitionSchema.safeParse({
          nome: "Gigante",
          divisoes: [{ nivel: 1, nome: "A", porNome: false, desempate: "cbf", tamanho: 21, competidores: clubes(21) }],
          fronteiras: [],
        }).success
      ).toBe(false)
    })

    it("rejeita clubes repetidos na mesma divisão", () => {
      const mesmo = clube("Igual")
      const r = createCompetitionSchema.safeParse({
        nome: "Repetido",
        divisoes: [
          { nivel: 1, nome: "A", porNome: false, desempate: "cbf", tamanho: 2, competidores: [mesmo, mesmo] },
        ],
        fronteiras: [],
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        expect(r.error.issues.some((i) => /repetidos/.test(i.message))).toBe(true)
      }
    })
  })

  describe("campos básicos", () => {
    it("rejeita nome curto (< 2 após trim)", () => {
      expect(
        createCompetitionSchema.safeParse({
          nome: " a ",
          divisoes: [divisao(1, 4)],
          fronteiras: [],
        }).success
      ).toBe(false)
    })

    it("rejeita pirâmide sem divisões", () => {
      expect(
        createCompetitionSchema.safeParse({ nome: "Vazia", divisoes: [], fronteiras: [] })
          .success
      ).toBe(false)
    })

    it("respeita isPublic explícito (false)", () => {
      const r = createCompetitionSchema.safeParse({
        nome: "Privada",
        isPublic: false,
        divisoes: [divisao(1, 4)],
        fronteiras: [],
      })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.isPublic).toBe(false)
    })

    it("aceita desempate 'espanhol'/'fifa' (habilitados na Fase 5)", () => {
      expect(
        createCompetitionSchema.safeParse({
          nome: "La Liga",
          divisoes: [
            { nivel: 1, nome: "A", porNome: false, desempate: "espanhol", tamanho: 4, competidores: clubes(4) },
          ],
          fronteiras: [],
        }).success
      ).toBe(true)
    })

    it("rejeita desempate inexistente", () => {
      expect(
        createCompetitionSchema.safeParse({
          nome: "Inválido",
          divisoes: [
            { nivel: 1, nome: "A", porNome: false, desempate: "klingon", tamanho: 4, competidores: clubes(4) },
          ],
          fronteiras: [],
        }).success
      ).toBe(false)
    })
  })
})

/* -------------------------------------------------------------------------- */
/* Fase 2 — fronteiras de playoff/playout                                       */
/* -------------------------------------------------------------------------- */

describe("createCompetitionSchema (playoff/playout — Fase 2)", () => {
  /** Pirâmide de 2 divisões de tamanho `tam` com 1 fronteira de playoff. */
  const piramidePlayoff = (tam: number, fronteira: Record<string, unknown>) =>
    createCompetitionSchema.safeParse({
      nome: "Pirâmide Playoff",
      divisoes: [divisao(1, tam), divisao(2, tam)],
      fronteiras: [{ nivelSuperior: 1, ...fronteira }],
    })

  it("aceita playoff_acesso 'vagas' simétrico (chave 8, 4 sobem / 4 caem)", () => {
    const r = piramidePlayoff(8, {
      modo: "playoff_acesso",
      playoffEstilo: "vagas",
      playoffVagas: 8,
      vagasAcesso: 4,
      vagasRebaixamento: 4,
    })
    expect(r.success).toBe(true)
  })

  it("aceita playoff_acesso 'extra' (2 diretos + 1 na chave de 4; rebaixa 3 diretos)", () => {
    const r = piramidePlayoff(8, {
      modo: "playoff_acesso",
      playoffEstilo: "extra",
      playoffVagas: 4,
      playoffIdaEVolta: true,
      vagasAcesso: 2, // efetivo = 3 (com o campeão)
      vagasRebaixamento: 3, // direto = 3 (simetria sobre efetivos)
    })
    expect(r.success).toBe(true)
  })

  it("aceita playout 'extra' (1 queda direta + 1 perdedor; sobe 2 diretos)", () => {
    const r = piramidePlayoff(8, {
      modo: "playout",
      playoffEstilo: "extra",
      playoffVagas: 4,
      vagasRebaixamento: 1, // efetivo = 2 (com o perdedor da final)
      vagasAcesso: 2, // direto = 2 (simetria sobre efetivos)
    })
    expect(r.success).toBe(true)
  })

  it("REJEITA 'vagas' com nº de acesso não-potência-de-2 (chave 8, 3 sobem)", () => {
    const r = piramidePlayoff(8, {
      modo: "playoff_acesso",
      playoffEstilo: "vagas",
      playoffVagas: 8,
      vagasAcesso: 3,
      vagasRebaixamento: 3,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(z.treeifyError(r.error).errors.length + JSON.stringify(r.error.issues)).toMatch(
        /potência de 2|direto \+ 1/i
      )
    }
  })

  it("REJEITA playout 'vagas' impossível (8 jogam, 3 caem ⇒ sobram 5)", () => {
    const r = piramidePlayoff(8, {
      modo: "playout",
      playoffEstilo: "vagas",
      playoffVagas: 8,
      vagasRebaixamento: 3,
      vagasAcesso: 3,
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA 'extra' simétrico nos brutos (quebra a simetria dos efetivos)", () => {
    const r = piramidePlayoff(8, {
      modo: "playoff_acesso",
      playoffEstilo: "extra",
      playoffVagas: 4,
      vagasAcesso: 3,
      vagasRebaixamento: 3, // efetivo acesso=4 ≠ queda=3
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA chave que não cabe na divisão-fonte (chave 8, inferior tem 6)", () => {
    const r = createCompetitionSchema.safeParse({
      nome: "Zona grande demais",
      divisoes: [divisao(1, 8), divisao(2, 6)],
      fronteiras: [
        {
          nivelSuperior: 1,
          modo: "playoff_acesso",
          playoffEstilo: "vagas",
          playoffVagas: 8, // zona 8 > 6
          vagasAcesso: 4,
          vagasRebaixamento: 4,
        },
      ],
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA estilo de playoff numa fronteira 'direto'", () => {
    const r = piramidePlayoff(8, {
      modo: "direto",
      playoffEstilo: "vagas",
      vagasAcesso: 4,
      vagasRebaixamento: 4,
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA fronteira de playoff sem estilo", () => {
    const r = piramidePlayoff(8, {
      modo: "playoff_acesso",
      playoffVagas: 8,
      vagasAcesso: 4,
      vagasRebaixamento: 4,
    })
    expect(r.success).toBe(false)
  })
})

describe("barragem cruzada (Fase 3)", () => {
  const barragem = (tam: number, fronteira: Record<string, unknown>) =>
    createCompetitionSchema.safeParse({
      nome: "Pirâmide Barragem",
      divisoes: [divisao(1, tam), divisao(2, tam)],
      fronteiras: [{ nivelSuperior: 1, ...fronteira }],
    })

  it("aceita 'pares' simétrica (2 diretos + 2 pares, ida-e-volta)", () => {
    const r = barragem(8, {
      modo: "barragem_cruzada",
      playoffEstilo: "pares",
      playoffVagas: 4, // B=2 pares
      playoffIdaEVolta: true,
      vagasAcesso: 2,
      vagasRebaixamento: 2,
    })
    expect(r.success).toBe(true)
  })

  it("aceita 'chave' (1 defensor + 3 desafiantes; pv potência de 2)", () => {
    const r = barragem(8, {
      modo: "barragem_cruzada",
      playoffEstilo: "chave",
      playoffVagas: 4, // k=3
      vagasAcesso: 1,
      vagasRebaixamento: 1,
    })
    expect(r.success).toBe(true)
  })

  it("REJEITA 'pares' com nº de participantes ímpar", () => {
    const r = barragem(8, {
      modo: "barragem_cruzada",
      playoffEstilo: "pares",
      playoffVagas: 3,
      vagasAcesso: 1,
      vagasRebaixamento: 1,
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA 'chave' com tamanho não potência de 2", () => {
    const r = barragem(8, {
      modo: "barragem_cruzada",
      playoffEstilo: "chave",
      playoffVagas: 6,
      vagasAcesso: 1,
      vagasRebaixamento: 1,
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA barragem assimétrica (acesso direto != rebaixamento direto)", () => {
    const r = barragem(8, {
      modo: "barragem_cruzada",
      playoffEstilo: "pares",
      playoffVagas: 4,
      vagasAcesso: 3,
      vagasRebaixamento: 2,
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA estilo de playoff ('vagas') no modo barragem", () => {
    const r = barragem(8, {
      modo: "barragem_cruzada",
      playoffEstilo: "vagas",
      playoffVagas: 4,
      vagasAcesso: 2,
      vagasRebaixamento: 2,
    })
    expect(r.success).toBe(false)
  })

  it("REJEITA barragem entre divisões com por_nome divergente", () => {
    const r = createCompetitionSchema.safeParse({
      nome: "Barragem heterogênea",
      divisoes: [
        divisao(1, 8, { porNome: false }),
        divisao(2, 8, { porNome: true }),
      ],
      fronteiras: [
        {
          nivelSuperior: 1,
          modo: "barragem_cruzada",
          playoffEstilo: "pares",
          playoffVagas: 4,
          vagasAcesso: 2,
          vagasRebaixamento: 2,
        },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => /MESMO modo|por clube ou ambas por nome/.test(i.message))
      ).toBe(true)
    }
  })

  it("REJEITA barragem cuja zona não cabe na divisão", () => {
    const r = barragem(4, {
      modo: "barragem_cruzada",
      playoffEstilo: "pares",
      playoffVagas: 8, // B=4; zona = 1 + 4 = 5 > tamanho 4
      vagasAcesso: 1,
      vagasRebaixamento: 1,
    })
    expect(r.success).toBe(false)
  })
})

describe("createCompetitionSchema (formato grupos+mata-mata — Fase 5.2)", () => {
  const piramide = (divExtra: Record<string, unknown>) =>
    createCompetitionSchema.safeParse({
      nome: "Copa Teste",
      divisoes: [{ ...divisao(1, 8), ...divExtra }],
      fronteiras: [],
    })

  it("aceita grupos com geometria que FECHA a chave (8 times: 2 grupos × 2 = 4)", () => {
    const r = piramide({ formato: "grupos_mata_mata", qtdGrupos: 2, classificadosPorGrupo: 2 })
    expect(r.success).toBe(true)
  })

  it("aceita 4 grupos × 2 = 8 (chave de 8) num tamanho 8 (4 por grupo)", () => {
    const r = createCompetitionSchema.safeParse({
      nome: "Copa 4G",
      divisoes: [
        { ...divisao(1, 8), formato: "grupos_mata_mata", qtdGrupos: 4, classificadosPorGrupo: 2 },
      ],
      fronteiras: [],
    })
    // 4 grupos de 2 → K=2 não cabe (K < menor grupo = 2 é falso). Rejeita.
    expect(r.success).toBe(false)
  })

  it("rejeita total que NÃO fecha a chave (2 grupos × 3 = 6 ∉ {2,4,8,16,32})", () => {
    const r = piramide({ formato: "grupos_mata_mata", qtdGrupos: 2, classificadosPorGrupo: 3 })
    expect(r.success).toBe(false)
  })

  it("rejeita grupos com qtdGrupos < 2 (1 grupo = liga, não ofertado)", () => {
    const r = piramide({ formato: "grupos_mata_mata", qtdGrupos: 1, classificadosPorGrupo: 2 })
    expect(r.success).toBe(false)
  })

  it("rejeita formato 'liga' com geometria de grupos preenchida", () => {
    const r = piramide({ formato: "liga", qtdGrupos: 2, classificadosPorGrupo: 2 })
    expect(r.success).toBe(false)
  })

  it("rejeita grupos sem informar a geometria", () => {
    const r = piramide({ formato: "grupos_mata_mata" })
    expect(r.success).toBe(false)
  })

  it("'liga' (default) sem campos de grupo continua válido (não-regressão)", () => {
    const r = piramide({})
    expect(r.success).toBe(true)
  })
})

describe("createCompetitionSchema (turno ida-e-volta — change add-ida-volta-divisao)", () => {
  const piramide = (divExtra: Record<string, unknown>) =>
    createCompetitionSchema.safeParse({
      nome: "Liga Turno",
      divisoes: [{ ...divisao(1, 8), ...divExtra }],
      fronteiras: [],
    })

  it("idaEVolta ausente assume false (default; turno único — não-regressão)", () => {
    const r = piramide({})
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.divisoes[0].idaEVolta).toBe(false)
  })

  it("idaEVolta=true é aceito numa divisão de liga", () => {
    const r = piramide({ idaEVolta: true })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.divisoes[0].idaEVolta).toBe(true)
  })

  it("idaEVolta=true convive com grupos no SCHEMA (normalização liga-only é server-side)", () => {
    // O schema não rejeita o booleano; a action/wizard zeram em grupos_mata_mata.
    const r = piramide({
      formato: "grupos_mata_mata",
      qtdGrupos: 2,
      classificadosPorGrupo: 2,
      idaEVolta: true,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.divisoes[0].idaEVolta).toBe(true)
  })
})
