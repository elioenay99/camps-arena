import { describe, expect, it } from "vitest"

import { cupManualEntrySchema, cupRuleSchema, cupSchema } from "@/schema/cupSchema"

/* -------------------------------------------------------------------------- */
/* cupSchema                                                                     */
/* -------------------------------------------------------------------------- */

describe("cupSchema — criação da copa", () => {
  const base = {
    nome: "Copa do Brasil",
    abrangencia: "nacional" as const,
    formato: "mata_mata" as const,
  }

  it("aceita mata-mata sem geometria de grupos", () => {
    const r = cupSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it("rejeita nome curto", () => {
    const r = cupSchema.safeParse({ ...base, nome: "x" })
    expect(r.success).toBe(false)
  })

  it("rejeita geometria de grupos em mata-mata", () => {
    const r = cupSchema.safeParse({ ...base, qtdGrupos: 2, classificadosPorGrupo: 2 })
    expect(r.success).toBe(false)
  })

  it("aceita grupos+mata com geometria coerente (2×2=4 potência de 2)", () => {
    const r = cupSchema.safeParse({
      ...base,
      formato: "grupos_mata_mata",
      qtdGrupos: 2,
      classificadosPorGrupo: 2,
    })
    expect(r.success).toBe(true)
  })

  it("aceita 4 grupos × 4 classificados = 16 (potência de 2)", () => {
    const r = cupSchema.safeParse({
      ...base,
      formato: "grupos_mata_mata",
      qtdGrupos: 4,
      classificadosPorGrupo: 4,
    })
    expect(r.success).toBe(true)
  })

  it("rejeita grupos+mata sem geometria", () => {
    const r = cupSchema.safeParse({ ...base, formato: "grupos_mata_mata" })
    expect(r.success).toBe(false)
  })

  it("rejeita produto não potência de 2 (2 grupos × 3 = 6)", () => {
    const r = cupSchema.safeParse({
      ...base,
      formato: "grupos_mata_mata",
      qtdGrupos: 2,
      classificadosPorGrupo: 3,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita produto > 32 (8 grupos × 8 = 64)", () => {
    const r = cupSchema.safeParse({
      ...base,
      formato: "grupos_mata_mata",
      qtdGrupos: 8,
      classificadosPorGrupo: 8,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita 1 grupo (use mata-mata)", () => {
    const r = cupSchema.safeParse({
      ...base,
      formato: "grupos_mata_mata",
      qtdGrupos: 1,
      classificadosPorGrupo: 2,
    })
    expect(r.success).toBe(false)
  })

  it("normaliza cor hex maiúscula para minúscula", () => {
    const r = cupSchema.safeParse({ ...base, corPrimaria: "#AABBCC" })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.corPrimaria).toBe("#aabbcc")
  })

  it("aplica defaults (porNome=false, idaEVolta=false, isPublic=true, desempate=cbf)", () => {
    const r = cupSchema.parse(base)
    expect(r.porNome).toBe(false)
    expect(r.idaEVolta).toBe(false)
    expect(r.terceiroLugar).toBe(false)
    expect(r.isPublic).toBe(true)
    expect(r.desempateCriterio).toBe("cbf")
  })
})

/* -------------------------------------------------------------------------- */
/* cupRuleSchema                                                                 */
/* -------------------------------------------------------------------------- */

describe("cupRuleSchema — regra de qualificação", () => {
  const uuid = "11111111-1111-4111-8111-111111111111"
  const uuid2 = "22222222-2222-4222-8222-222222222222"

  it("aceita origem divisão (competition + nivel)", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "divisao",
      origemCompetitionId: uuid,
      origemNivel: 1,
      posicaoInicio: 1,
      posicaoFim: 4,
    })
    expect(r.success).toBe(true)
  })

  it("aceita origem copa (cupId)", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "copa",
      origemCupId: uuid,
      posicaoInicio: 1,
      posicaoFim: 1,
    })
    expect(r.success).toBe(true)
  })

  it("rejeita divisão sem nível", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "divisao",
      origemCompetitionId: uuid,
      posicaoInicio: 1,
      posicaoFim: 4,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita origem ambígua (divisão E copa juntas)", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "divisao",
      origemCompetitionId: uuid,
      origemNivel: 1,
      origemCupId: uuid2,
      posicaoInicio: 1,
      posicaoFim: 4,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita copa com pirâmide/nível", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "copa",
      origemCupId: uuid,
      origemNivel: 1,
      posicaoInicio: 1,
      posicaoFim: 1,
    })
    expect(r.success).toBe(false)
  })

  it("rejeita faixa invertida (fim < inicio)", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "divisao",
      origemCompetitionId: uuid,
      origemNivel: 1,
      posicaoInicio: 5,
      posicaoFim: 2,
    })
    expect(r.success).toBe(false)
  })

  it("aceita faixa de 1 vaga (inicio == fim)", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "copa",
      origemCupId: uuid,
      posicaoInicio: 1,
      posicaoFim: 1,
    })
    expect(r.success).toBe(true)
  })

  it("rejeita posição < 1", () => {
    const r = cupRuleSchema.safeParse({
      origemTipo: "divisao",
      origemCompetitionId: uuid,
      origemNivel: 1,
      posicaoInicio: 0,
      posicaoFim: 4,
    })
    expect(r.success).toBe(false)
  })

  it("prioridade default = 0", () => {
    const r = cupRuleSchema.parse({
      origemTipo: "copa",
      origemCupId: uuid,
      posicaoInicio: 1,
      posicaoFim: 1,
    })
    expect(r.prioridade).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* cupManualEntrySchema                                                          */
/* -------------------------------------------------------------------------- */

describe("cupManualEntrySchema — participante manual", () => {
  const uuid = "33333333-3333-4333-8333-333333333333"

  it("copa por clube aceita teamId", () => {
    const r = cupManualEntrySchema.safeParse({ porNome: false, teamId: uuid })
    expect(r.success).toBe(true)
  })

  it("copa por clube rejeita rótulo", () => {
    const r = cupManualEntrySchema.safeParse({ porNome: false, rotulo: "Flamengo" })
    expect(r.success).toBe(false)
  })

  it("copa por nome aceita rótulo", () => {
    const r = cupManualEntrySchema.safeParse({ porNome: true, rotulo: "Flamengo" })
    expect(r.success).toBe(true)
  })

  it("copa por nome rejeita teamId", () => {
    const r = cupManualEntrySchema.safeParse({ porNome: true, teamId: uuid })
    expect(r.success).toBe(false)
  })

  it("normaliza rótulo com trim", () => {
    const r = cupManualEntrySchema.parse({ porNome: true, rotulo: "  Flamengo  " })
    expect(r.rotulo).toBe("Flamengo")
  })

  it("rejeita rótulo vazio em copa por nome", () => {
    const r = cupManualEntrySchema.safeParse({ porNome: true, rotulo: "   " })
    expect(r.success).toBe(false)
  })
})
