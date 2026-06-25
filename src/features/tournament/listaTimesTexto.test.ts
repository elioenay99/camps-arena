import { describe, expect, it } from "vitest"

import { listaTimesTexto } from "@/features/tournament/listaTimesTexto"
import type { VagaDoTorneio } from "@/features/tournament/data/getVagasDoTorneio"

function vaga(over: Partial<VagaDoTorneio>): VagaDoTorneio {
  return {
    id: "s1",
    clube: "Clube",
    escudoUrl: null,
    tecnico: null,
    porNome: false,
    ...over,
  }
}

describe("listaTimesTexto", () => {
  it("técnico com celular no mapa: clube + nome + celular", () => {
    const out = listaTimesTexto(
      [vaga({ clube: "Grêmio", tecnico: { id: "u1", nome: "Ana", avatar: null } })],
      new Map([["u1", "11912345678"]])
    )
    expect(out).toEqual([
      { clube: "Grêmio", comandante: "Ana", celular: "11912345678" },
    ])
  })

  it("técnico sem celular no mapa: celular vira null", () => {
    const out = listaTimesTexto(
      [vaga({ clube: "Inter", tecnico: { id: "u2", nome: "Beto", avatar: null } })],
      new Map()
    )
    expect(out[0]).toMatchObject({ clube: "Inter", comandante: "Beto", celular: null })
  })

  it("técnico presente sem nome vira 'Sem nome' (NUNCA ❌): comandante não-nulo", () => {
    const out = listaTimesTexto(
      [vaga({ clube: "Ocupado", tecnico: { id: "u3", nome: null, avatar: null } })],
      new Map()
    )
    // comandante não-nulo ⇒ mensagemListaTimes não marca ❌; cai no fallback "Sem nome".
    expect(out[0].comandante).toBe("Sem nome")
  })

  it("nome só com espaços também cai no fallback 'Sem nome'", () => {
    const out = listaTimesTexto(
      [vaga({ clube: "Ocupado", tecnico: { id: "u4", nome: "   ", avatar: null } })],
      new Map()
    )
    expect(out[0].comandante).toBe("Sem nome")
  })

  it("vaga SEM técnico (órfã/por-nome): comandante null (⇒ ❌) e celular null", () => {
    const out = listaTimesTexto(
      [
        vaga({ clube: "Órfão", tecnico: null }),
        vaga({ clube: "Time do João", tecnico: null, porNome: true }),
      ],
      new Map([["u1", "11912345678"]])
    )
    expect(out).toEqual([
      { clube: "Órfão", comandante: null, celular: null },
      { clube: "Time do João", comandante: null, celular: null },
    ])
  })
})
