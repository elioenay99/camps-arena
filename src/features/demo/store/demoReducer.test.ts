import { describe, expect, it } from "vitest"

import { demoReducer, type DemoState } from "./demoReducer"
import { criarEstadoInicial } from "./estadoInicial"

function seed(): DemoState {
  return criarEstadoInicial()
}

describe("demoReducer", () => {
  it("CRIAR_TORNEIO adiciona um torneio rascunho ao topo (só estado local)", () => {
    const s0 = seed()
    const n = s0.torneios.length
    const s1 = demoReducer(s0, {
      type: "CRIAR_TORNEIO",
      nome: "Copa Teste",
      formato: "liga",
    })
    expect(s1.torneios.length).toBe(n + 1)
    expect(s1.torneios[0].nome).toBe("Copa Teste")
    expect(s1.torneios[0].status).toBe("rascunho")
    // Imutabilidade: o estado anterior não muda.
    expect(s0.torneios.length).toBe(n)
  })

  it("EDITAR_TORNEIO renomeia e troca o formato", () => {
    const s0 = seed()
    const id = s0.torneios[0].id
    const s1 = demoReducer(s0, {
      type: "EDITAR_TORNEIO",
      id,
      nome: "Renomeado",
      formato: "mata_mata",
    })
    const t = s1.torneios.find((x) => x.id === id)!
    expect(t.nome).toBe("Renomeado")
    expect(t.formato).toBe("mata_mata")
  })

  it("EXCLUIR_TORNEIO remove só do estado local", () => {
    const s0 = seed()
    const id = s0.torneios[0].id
    const s1 = demoReducer(s0, { type: "EXCLUIR_TORNEIO", id })
    expect(s1.torneios.find((x) => x.id === id)).toBeUndefined()
    expect(s1.torneios.length).toBe(s0.torneios.length - 1)
  })

  it("MUDAR_STATUS altera o status", () => {
    const s0 = seed()
    const id = s0.torneios[0].id
    const s1 = demoReducer(s0, { type: "MUDAR_STATUS", id, status: "encerrado" })
    expect(s1.torneios.find((x) => x.id === id)!.status).toBe("encerrado")
  })

  it("EDITAR_PLACAR grava o placar e marca a partida encerrada", () => {
    const s0 = seed()
    const liga = s0.torneios.find((t) => t.id === "demo-liga")!
    const emAndamento = liga.partidas.find((p) => p.status === "em_andamento")!
    const s1 = demoReducer(s0, {
      type: "EDITAR_PLACAR",
      torneioId: "demo-liga",
      matchId: emAndamento.id,
      placar_1: 3,
      placar_2: 1,
    })
    const p = s1.torneios
      .find((t) => t.id === "demo-liga")!
      .partidas.find((x) => x.id === emAndamento.id)!
    expect(p.placar_1).toBe(3)
    expect(p.placar_2).toBe(1)
    expect(p.status).toBe("encerrada")
  })

  it("EDITAR_PLACAR limpa as flags de W.O. (vira resultado real)", () => {
    const s0 = seed()
    const liga = s0.torneios.find((t) => t.id === "demo-liga")!
    const wo = liga.partidas.find((p) => p.woVencedor)!
    expect(wo).toBeTruthy()
    const s1 = demoReducer(s0, {
      type: "EDITAR_PLACAR",
      torneioId: "demo-liga",
      matchId: wo.id,
      placar_1: 2,
      placar_2: 1,
    })
    const p = s1.torneios
      .find((t) => t.id === "demo-liga")!
      .partidas.find((x) => x.id === wo.id)!
    expect(p.woVencedor).toBeUndefined()
    expect(p.woDuplo).toBeUndefined()
    expect(p.placar_1).toBe(2)
    expect(p.placar_2).toBe(1)
  })

  it("EDITAR_PLACAR limpa o duplo W.O. também", () => {
    const s0 = seed()
    const liga = s0.torneios.find((t) => t.id === "demo-liga")!
    const duplo = liga.partidas.find((p) => p.woDuplo)!
    expect(duplo).toBeTruthy()
    const s1 = demoReducer(s0, {
      type: "EDITAR_PLACAR",
      torneioId: "demo-liga",
      matchId: duplo.id,
      placar_1: 0,
      placar_2: 0,
    })
    const p = s1.torneios
      .find((t) => t.id === "demo-liga")!
      .partidas.find((x) => x.id === duplo.id)!
    expect(p.woDuplo).toBeUndefined()
    expect(p.woVencedor).toBeUndefined()
  })

  it("REGISTRAR_AUTORES substitui os gols da partida (ignora vazios)", () => {
    const s0 = seed()
    const liga = s0.torneios.find((t) => t.id === "demo-liga")!
    const alvo = liga.partidas[0].id
    const s1 = demoReducer(s0, {
      type: "REGISTRAR_AUTORES",
      torneioId: "demo-liga",
      matchId: alvo,
      autores: [
        { lado: 1, jogador: "Fulano", gols: 2, contra: false },
        { lado: 2, jogador: "", gols: 1, contra: false },
      ],
    })
    const gols = s1.torneios
      .find((t) => t.id === "demo-liga")!
      .gols.filter((g) => g.matchId === alvo)
    expect(gols).toHaveLength(1)
    expect(gols[0].jogador).toBe("Fulano")
    expect(gols[0].gols).toBe(2)
  })

  it("TOGGLE_LISTAR alterna a flag de listado", () => {
    const s0 = seed()
    const item = s0.vitrine[0]
    const s1 = demoReducer(s0, { type: "TOGGLE_LISTAR", id: item.id })
    expect(s1.vitrine[0].listado).toBe(!item.listado)
  })

  it("TROCAR_PERFIL muda o perfil simulado", () => {
    const s0 = seed()
    const s1 = demoReducer(s0, { type: "TROCAR_PERFIL", perfil: "gestor" })
    expect(s1.perfil).toBe("gestor")
  })

  it("REINICIAR restaura o seed fornecido", () => {
    const s0 = seed()
    const alterado = demoReducer(s0, { type: "EXCLUIR_TORNEIO", id: s0.torneios[0].id })
    const restaurado = demoReducer(alterado, { type: "REINICIAR", seed: criarEstadoInicial() })
    expect(restaurado.torneios.length).toBe(s0.torneios.length)
  })
})
