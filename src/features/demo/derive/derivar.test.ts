import { describe, expect, it } from "vitest"

import { demoReducer } from "@/features/demo/store/demoReducer"
import { criarEstadoInicial } from "@/features/demo/store/estadoInicial"

import { derivarArtilharia } from "./derivarArtilharia"
import { derivarClassificacao } from "./derivarClassificacao"

function liga(state = criarEstadoInicial()) {
  return { state, torneio: state.torneios.find((t) => t.id === "demo-liga")! }
}

describe("derivarClassificacao", () => {
  it("produz uma linha por competidor com nome resolvido", () => {
    const { state, torneio } = liga()
    const { linhas } = derivarClassificacao(torneio, state.identidades)
    expect(linhas.length).toBe(torneio.participantes.length)
    for (const l of linhas) expect(l.nome).toBeTruthy()
  })

  it("recomputa a classificação AO VIVO após EDITAR_PLACAR", () => {
    const s0 = criarEstadoInicial()
    const t0 = s0.torneios.find((t) => t.id === "demo-liga")!
    const antes = derivarClassificacao(t0, s0.identidades)
    const emAndamento = t0.partidas.find((p) => p.status === "em_andamento")!

    // Vitória larga do lado 1 muda a soma de pontos/gols do torneio.
    const s1 = demoReducer(s0, {
      type: "EDITAR_PLACAR",
      torneioId: "demo-liga",
      matchId: emAndamento.id,
      placar_1: 5,
      placar_2: 0,
    })
    const t1 = s1.torneios.find((t) => t.id === "demo-liga")!
    const depois = derivarClassificacao(t1, s1.identidades)

    const golsAntes = antes.linhas.reduce((a, l) => a + l.golsPro, 0)
    const golsDepois = depois.linhas.reduce((a, l) => a + l.golsPro, 0)
    expect(golsDepois).toBe(golsAntes + 5)

    const venc = emAndamento.participante_1!
    const pontosAntes =
      antes.linhas.find((l) => l.participanteId === venc)?.pontos ?? 0
    const pontosDepois =
      depois.linhas.find((l) => l.participanteId === venc)?.pontos ?? 0
    expect(pontosDepois).toBe(pontosAntes + 3)
  })

  it("editar uma partida de W.O. faz o jogo passar a contar gols e Muralha", () => {
    const s0 = criarEstadoInicial()
    const t0 = s0.torneios.find((t) => t.id === "demo-liga")!
    const wo = t0.partidas.find((p) => p.woVencedor)!
    const antes = derivarClassificacao(t0, s0.identidades)
    const golsAntes = antes.linhas.reduce((a, l) => a + l.golsPro, 0)
    const jogosMuralhaAntes = antes.muralha.reduce((a, m) => a + m.jogos, 0)

    // 0x0 de W.O. → resultado real 3x1: a soma de gols da tabela sobe 4 e a
    // Muralha passa a considerar o jogo (mais jogos contados).
    const s1 = demoReducer(s0, {
      type: "EDITAR_PLACAR",
      torneioId: "demo-liga",
      matchId: wo.id,
      placar_1: 3,
      placar_2: 1,
    })
    const t1 = s1.torneios.find((t) => t.id === "demo-liga")!
    const depois = derivarClassificacao(t1, s1.identidades)
    const golsDepois = depois.linhas.reduce((a, l) => a + l.golsPro, 0)
    const jogosMuralhaDepois = depois.muralha.reduce((a, m) => a + m.jogos, 0)

    expect(golsDepois).toBe(golsAntes + 4)
    expect(jogosMuralhaDepois).toBeGreaterThan(jogosMuralhaAntes)
  })

  it("deriva a Muralha (clean sheets) das mesmas partidas", () => {
    const { state, torneio } = liga()
    const { muralha } = derivarClassificacao(torneio, state.identidades)
    expect(muralha.length).toBeGreaterThan(0)
    for (const m of muralha) expect(m.cleanSheets).toBeGreaterThanOrEqual(0)
  })
})

describe("derivarArtilharia", () => {
  it("agrega por competidor+nome, ordena por gols desc e ignora vazios", () => {
    const { state, torneio } = liga()
    const art = derivarArtilharia(torneio, state.identidades)
    expect(art.length).toBeGreaterThan(0)
    for (let i = 1; i < art.length; i++) {
      expect(art[i - 1].gols).toBeGreaterThanOrEqual(art[i].gols)
    }
  })

  it("reflete autores registrados após REGISTRAR_AUTORES", () => {
    const s0 = criarEstadoInicial()
    const t0 = s0.torneios.find((t) => t.id === "demo-liga")!
    const alvo = t0.partidas.find((p) => p.status === "encerrada")!
    const s1 = demoReducer(s0, {
      type: "REGISTRAR_AUTORES",
      torneioId: "demo-liga",
      matchId: alvo.id,
      autores: [{ lado: 1, jogador: "ArtilheiroDemo", gols: 3, contra: false }],
    })
    const t1 = s1.torneios.find((t) => t.id === "demo-liga")!
    const art = derivarArtilharia(t1, s1.identidades)
    expect(art.some((a) => a.jogador === "ArtilheiroDemo" && a.gols === 3)).toBe(true)
  })
})
