import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const TORNEIO = {
  id: "11111111-1111-4111-8111-111111111111",
  titulo: "Copa",
  status: "ativo",
  pontos_vitoria: 3,
  pontos_empate: 1,
  pontos_derrota: 0,
}

interface Cenario {
  torneio?: unknown | null
  torneioError?: { message: string } | null
  partidas?: unknown[] | null
  partidasError?: { message: string } | null
}

/**
 * Cliente falso bifurcado por tabela:
 *  - tournaments: select().eq().maybeSingle()
 *  - matches: select().eq() → thenable {data,error}
 */
function montarClient(c: Cenario) {
  const partidasEqSpy = vi.fn()
  const partidasSelectSpy = vi.fn()
  const client = {
    from: vi.fn((tabela: string) =>
      tabela === "tournaments"
        ? {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: c.torneio ?? null,
                  error: c.torneioError ?? null,
                })),
              })),
            })),
          }
        : {
            select: vi.fn((cols: unknown) => {
              partidasSelectSpy(cols)
              return {
                eq: vi.fn((col: string, val: unknown) => {
                  partidasEqSpy(col, val)
                  return Promise.resolve({
                    data: c.partidas ?? null,
                    error: c.partidasError ?? null,
                  })
                }),
              }
            }),
          }
    ),
    partidasEqSpy,
    partidasSelectSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

function partidaEncerrada(
  p1: { id: string; nome: string | null },
  p2: { id: string; nome: string | null },
  placar_1: number,
  placar_2: number
) {
  return {
    participante_1: p1.id,
    participante_2: p2.id,
    placar_1,
    placar_2,
    status: "encerrada",
    p1,
    p2,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("getTournamentClassificacao", () => {
  it("torneio invisível/inexistente devolve null SEM consultar partidas", async () => {
    const client = montarClient({ torneio: null })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r).toBeNull()
    expect(client.from).toHaveBeenCalledWith("tournaments")
    expect(client.from).not.toHaveBeenCalledWith("matches")
  })

  it("erro na query do torneio lança erro amigável", async () => {
    montarClient({ torneioError: { message: "down" } })
    await expect(getTournamentClassificacao(TORNEIO.id)).rejects.toThrow(
      /Falha ao carregar o torneio/
    )
  })

  it("erro na query de partidas lança erro amigável", async () => {
    montarClient({ torneio: TORNEIO, partidasError: { message: "down" } })
    await expect(getTournamentClassificacao(TORNEIO.id)).rejects.toThrow(
      /Falha ao carregar as partidas/
    )
  })

  it("integra o motor com as REGRAS do torneio e resolve nomes dos embeds", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    const client = montarClient({
      // Regras custom 2/1/0 provam que as colunas do torneio alimentam o motor.
      torneio: { ...TORNEIO, pontos_vitoria: 2 },
      partidas: [partidaEncerrada(ana, beto, 1, 0)],
    })

    const r = await getTournamentClassificacao(TORNEIO.id)

    expect(client.partidasEqSpy).toHaveBeenCalledWith("tournament_id", TORNEIO.id)
    expect(r?.linhas).toEqual([
      expect.objectContaining({ nome: "Ana", posicao: 1, pontos: 2, vitorias: 1 }),
      expect.objectContaining({ nome: "Beto", posicao: 2, pontos: 0 }),
    ])
  })

  it("partida não encerrada não pontua (motor filtra)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: TORNEIO,
      partidas: [
        { ...partidaEncerrada(ana, beto, 9, 0), status: "em_andamento" },
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.linhas).toEqual([])
  })

  it("participante sem nome ganha o fallback 'Sem nome' e o empate usa pontos_empate", async () => {
    const semNome = { id: "u1", nome: null }
    const beto = { id: "u2", nome: "  " }
    montarClient({
      // pontos_empate custom prova o wiring empate→regras (não só vitória).
      torneio: { ...TORNEIO, pontos_empate: 2 },
      partidas: [partidaEncerrada(semNome, beto, 1, 1)],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.linhas.map((l) => l.nome)).toEqual(["Sem nome", "Sem nome"])
    expect(r?.linhas.map((l) => l.pontos)).toEqual([2, 2])
  })

  it("embed seleciona ids E nomes com FK-hints explícitos + colunas que o motor consome", async () => {
    const client = montarClient({ torneio: TORNEIO, partidas: [] })
    await getTournamentClassificacao(TORNEIO.id)
    // Normaliza whitespace: o postgrest-js remove espaços não-citados antes
    // de enviar — assertar a forma normalizada evita acoplar à formatação.
    const cols = String(client.partidasSelectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    expect(cols).toContain("p1:users!matches_participante_1_fkey(id,nome)")
    expect(cols).toContain("p2:users!matches_participante_2_fkey(id,nome)")
    // Colunas cruas: insumos do motor — removê-las quebraria a classificação.
    expect(cols).toContain("participante_1")
    expect(cols).toContain("participante_2")
    expect(cols).toContain("placar_1")
    expect(cols).toContain("placar_2")
    expect(cols).toContain("status")
    expect(cols).not.toContain("celular")
  })

  it("sem partidas devolve tabela vazia com o torneio", async () => {
    montarClient({ torneio: TORNEIO, partidas: null })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.torneio).toMatchObject({ titulo: "Copa" })
    expect(r?.linhas).toEqual([])
  })
})
