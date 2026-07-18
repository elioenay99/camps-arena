// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Canal Realtime fake: captura o handler de postgres_changes para dirigir
// eventos no teste e expõe o spy de removeChannel para checar o cleanup.
const h = vi.hoisted(() => {
  const state: {
    handler?: (payload: { new: unknown }) => void
    onConfig?: { filter?: string }
  } = {}
  const removeChannel = vi.fn()
  const channelObj: {
    on: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  } = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channelObj.on = vi.fn(
    (
      _event: string,
      cfg: { filter?: string },
      handler: (p: { new: unknown }) => void
    ) => {
      state.handler = handler
      state.onConfig = cfg
      return channelObj
    }
  )
  channelObj.subscribe = vi.fn(() => channelObj)
  const channel = vi.fn(() => channelObj)
  return { state, removeChannel, channel }
})

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ channel: h.channel, removeChannel: h.removeChannel }),
}))

import {
  LiveMatchesProvider,
  type LiveMatchSeed,
} from "@/features/match/live/LiveMatchesProvider"
import { LiveScore, LiveScoreSr } from "@/features/match/live/LiveScore"
import { LiveStatusBadge } from "@/features/match/live/LiveStatusBadge"

function emitir(novo: {
  id: string
  placar_1: number
  placar_2: number
  status: string
}) {
  act(() => {
    h.state.handler?.({ new: novo })
  })
}

const SEED: LiveMatchSeed[] = [
  { id: "m1", placar_1: 0, placar_2: 0, status: "em_andamento" },
]

function montar(seed: LiveMatchSeed[] = SEED) {
  return render(
    <LiveMatchesProvider initial={seed}>
      <LiveScore matchId="m1" field="placar_1" initial={0} />
      <LiveScore matchId="m1" field="placar_2" initial={0} />
      <LiveStatusBadge matchId="m1" initial="em_andamento" />
      <LiveScoreSr
        matchId="m1"
        nome1="Casa"
        nome2="Fora"
        initial1={0}
        initial2={0}
      />
    </LiveMatchesProvider>
  )
}

beforeEach(() => {
  h.state.handler = undefined
  h.removeChannel.mockClear()
  h.channel.mockClear()
})
afterEach(cleanup)

describe("camada de tempo real do painel", () => {
  it("renderiza os valores iniciais semeados", () => {
    montar()
    expect(screen.getAllByText("0")).toHaveLength(2)
    expect(screen.getByText("em andamento")).toBeInTheDocument()
    expect(
      screen.getByText("Placar atual: Casa 0, Fora 0")
    ).toBeInTheDocument()
  })

  it("atualiza placar e status de uma partida na tela ao chegar UPDATE", () => {
    montar()
    emitir({ id: "m1", placar_1: 2, placar_2: 1, status: "em_andamento" })

    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(
      screen.getByText("Placar atual: Casa 2, Fora 1")
    ).toBeInTheDocument()
  })

  it("reflete a transição de status para encerrada", () => {
    montar()
    emitir({ id: "m1", placar_1: 3, placar_2: 0, status: "encerrada" })
    expect(screen.getByText("encerrada")).toBeInTheDocument()
  })

  it("ignora UPDATE de partida que não está na tela", () => {
    montar()
    emitir({ id: "m999", placar_1: 9, placar_2: 9, status: "em_andamento" })

    expect(screen.getAllByText("0")).toHaveLength(2)
    expect(screen.queryByText("9")).not.toBeInTheDocument()
    expect(
      screen.getByText("Placar atual: Casa 0, Fora 0")
    ).toBeInTheDocument()
  })

  it("atualiza a partida certa quando há várias no provider", () => {
    render(
      <LiveMatchesProvider
        initial={[
          { id: "m1", placar_1: 0, placar_2: 0, status: "em_andamento" },
          { id: "m2", placar_1: 0, placar_2: 0, status: "agendada" },
        ]}
      >
        <LiveScoreSr
          matchId="m1"
          nome1="A1"
          nome2="A2"
          initial1={0}
          initial2={0}
        />
        <LiveScoreSr
          matchId="m2"
          nome1="B1"
          nome2="B2"
          initial1={0}
          initial2={0}
        />
      </LiveMatchesProvider>
    )

    emitir({ id: "m2", placar_1: 3, placar_2: 2, status: "agendada" })

    // m2 mudou; m1 permaneceu intacto (sem corromper a chave do mapa).
    expect(screen.getByText("Placar atual: B1 3, B2 2")).toBeInTheDocument()
    expect(screen.getByText("Placar atual: A1 0, A2 0")).toBeInTheDocument()
  })

  it("resemeia o estado quando o `initial` muda (refresh da RSC)", () => {
    const { rerender } = render(
      <LiveMatchesProvider initial={SEED}>
        <LiveScoreSr matchId="m1" nome1="C" nome2="F" initial1={0} initial2={0} />
      </LiveMatchesProvider>
    )

    // Realtime faz o estado divergir do render inicial.
    emitir({ id: "m1", placar_1: 2, placar_2: 1, status: "em_andamento" })
    expect(screen.getByText("Placar atual: C 2, F 1")).toBeInTheDocument()

    // Refresh da RSC traz dados frescos e autoritativos (nova referência de
    // `initial`): o estado é resemeado, sobrescrevendo o valor vivo antigo.
    rerender(
      <LiveMatchesProvider
        initial={[{ id: "m1", placar_1: 5, placar_2: 3, status: "encerrada" }]}
      >
        <LiveScoreSr matchId="m1" nome1="C" nome2="F" initial1={5} initial2={3} />
      </LiveMatchesProvider>
    )
    expect(screen.getByText("Placar atual: C 5, F 3")).toBeInTheDocument()
    expect(
      screen.queryByText("Placar atual: C 2, F 1")
    ).not.toBeInTheDocument()
  })

  it("o texto vivo do placar é uma região live polite", () => {
    montar()
    const regiao = screen.getByText(/^Placar atual:/)
    expect(regiao).toHaveAttribute("role", "status")
    expect(regiao).toHaveAttribute("aria-live", "polite")
  })

  it("assina o canal e remove no unmount", () => {
    const { unmount } = montar()
    expect(h.channel).toHaveBeenCalledOnce()
    expect(h.removeChannel).not.toHaveBeenCalled()
    unmount()
    expect(h.removeChannel).toHaveBeenCalledOnce()
  })

  it("dashboard (sem tournamentId): canal global e SEM filtro na origem", () => {
    montar()
    // O dashboard multi-torneio assina todos os matches visíveis por RLS e filtra
    // no cliente (comportamento deliberado — não regride).
    expect(h.channel).toHaveBeenCalledWith("dashboard-matches")
    expect(h.state.onConfig?.filter).toBeUndefined()
  })

  it("página de torneio (tournamentId): canal escopado e filtro na origem", () => {
    render(
      <LiveMatchesProvider initial={SEED} tournamentId="t1">
        <LiveScore matchId="m1" field="placar_1" initial={0} />
      </LiveMatchesProvider>
    )
    // Escopa a assinatura por tournament_id (o Postgres filtra na origem) e usa um
    // nome de canal próprio para não colidir com outro provider.
    expect(h.channel).toHaveBeenCalledWith("matches-torneio-t1")
    expect(h.state.onConfig?.filter).toBe("tournament_id=eq.t1")
  })
})

describe("folhas live fora de um provider", () => {
  it("caem no valor inicial vindo da RSC", () => {
    render(
      <>
        <LiveScore matchId="x" field="placar_1" initial={5} />
        <LiveStatusBadge matchId="x" initial="agendada" />
      </>
    )
    expect(screen.getByText("5")).toBeInTheDocument()
    expect(screen.getByText("agendada")).toBeInTheDocument()
  })
})
