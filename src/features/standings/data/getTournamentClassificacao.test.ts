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
  formato: "avulso",
  ida_e_volta: false,
  created_by: "dono-1",
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
 *  - matches: select().eq().order() → {data,error}
 */
function montarClient(c: Cenario) {
  const partidasEqSpy = vi.fn()
  const partidasSelectSpy = vi.fn()
  const partidasOrderSpy = vi.fn()
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
                  return {
                    order: vi.fn((coluna: string, opts: unknown) => {
                      partidasOrderSpy(coluna, opts)
                      return Promise.resolve({
                        data: c.partidas ?? null,
                        error: c.partidasError ?? null,
                      })
                    }),
                  }
                }),
              }
            }),
          }
    ),
    partidasEqSpy,
    partidasSelectSpy,
    partidasOrderSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

let proximoId = 0

function partidaEncerrada(
  p1: { id: string; nome: string | null } | null,
  p2: { id: string; nome: string | null } | null,
  placar_1: number,
  placar_2: number,
  encerradaEm = "2026-06-04T12:00:00Z",
  clubes?: {
    t1: { id: string; nome: string } | null
    t2: { id: string; nome: string } | null
  }
) {
  proximoId += 1
  return {
    id: `m${proximoId}`,
    participante_1: p1?.id ?? null,
    participante_2: p2?.id ?? null,
    time_1: clubes?.t1?.id ?? null,
    time_2: clubes?.t2?.id ?? null,
    placar_1,
    placar_2,
    status: "encerrada",
    rodada: null,
    // created_at cresce com a ordem de criação — determinístico para o sort
    // estável de partidasAbertas.
    created_at: `2026-05-01T00:${String(proximoId).padStart(2, "0")}:00Z`,
    updated_at: encerradaEm,
    p1,
    p2,
    t1: clubes?.t1 ?? null,
    t2: clubes?.t2 ?? null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Ids determinísticos por teste: asserções de id não acoplam à ordem dos it.
  proximoId = 0
})

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
    // Insumos do histórico. O `id` precisa ser de TOPO: `toContain("id")`
    // seria falso positivo (os embeds `(id,nome)` contêm a substring).
    const colsCruas = String(client.partidasSelectSpy.mock.calls[0][0])
    expect(colsCruas).toMatch(/^\s*id\s*,/)
    expect(cols).toContain("updated_at")
    // Ordem estável das partidas em aberto.
    expect(cols).toContain("created_at")
    // Rodada da liga (rótulo e ordenação) — mesma viagem, sem query extra.
    expect(cols).toContain("rodada")
    // Insumos da classificação de clubes.
    expect(cols).toContain("time_1")
    expect(cols).toContain("time_2")
    expect(cols).toContain("t1:teams!matches_time_1_fkey(id,nome)")
    expect(cols).toContain("t2:teams!matches_time_2_fkey(id,nome)")
    expect(cols).not.toContain("celular")
  })

  it("clubes pontuam pelo MESMO motor e regras do torneio (re-chaveado por time)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    const gremio = { id: "c1", nome: "Grêmio" }
    const inter = { id: "c2", nome: "Inter" }
    montarClient({
      // pontos_vitoria custom prova que os clubes usam as regras do torneio.
      torneio: { ...TORNEIO, pontos_vitoria: 2 },
      partidas: [
        partidaEncerrada(ana, beto, 1, 0, "2026-06-04T12:00:00Z", {
          t1: gremio,
          t2: inter,
        }),
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.clubes).toEqual([
      expect.objectContaining({ nome: "Grêmio", posicao: 1, pontos: 2, vitorias: 1 }),
      expect.objectContaining({ nome: "Inter", posicao: 2, pontos: 0 }),
    ])
    // E a classificação de participantes vem do MESMO snapshot.
    expect(r?.linhas[0]).toMatchObject({ nome: "Ana", pontos: 2 })
  })

  it("partida não-encerrada com os dois clubes não pontua em clubes", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    const gremio = { id: "c1", nome: "Grêmio" }
    const inter = { id: "c2", nome: "Inter" }
    montarClient({
      torneio: TORNEIO,
      partidas: [
        {
          ...partidaEncerrada(ana, beto, 9, 0, "2026-06-04T12:00:00Z", {
            t1: gremio,
            t2: inter,
          }),
          status: "em_andamento",
        },
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.clubes).toEqual([])
  })

  it("partida sem os dois clubes não pontua em clubes (mas pontua em participantes)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    const gremio = { id: "c1", nome: "Grêmio" }
    montarClient({
      torneio: TORNEIO,
      partidas: [
        // Só um lado tem clube: não há confronto de clubes.
        partidaEncerrada(ana, beto, 1, 0, "2026-06-04T12:00:00Z", {
          t1: gremio,
          t2: null,
        }),
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.clubes).toEqual([])
    expect(r?.linhas).toHaveLength(2)
  })

  it("ordena por updated_at desc (encerradas mais recentes primeiro no histórico)", async () => {
    const client = montarClient({ torneio: TORNEIO, partidas: [] })
    await getTournamentClassificacao(TORNEIO.id)
    expect(client.partidasOrderSpy).toHaveBeenCalledWith("updated_at", {
      ascending: false,
    })
  })

  it("partidasEncerradas filtra só encerradas, preservando a ordem da query", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: TORNEIO,
      partidas: [
        partidaEncerrada(ana, beto, 2, 1, "2026-06-04T12:00:00Z"), // m1
        { ...partidaEncerrada(ana, beto, 0, 0), status: "em_andamento" },
        { ...partidaEncerrada(ana, beto, 0, 0), status: "agendada" },
        partidaEncerrada(beto, ana, 1, 0, "2026-06-01T12:00:00Z"), // m4
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    // `id` assertado: é a key da lista no MatchHistoryList.
    expect(r?.partidasEncerradas).toEqual([
      expect.objectContaining({
        id: "m1",
        nome_1: "Ana",
        nome_2: "Beto",
        placar_1: 2,
        placar_2: 1,
        encerradaEm: "2026-06-04T12:00:00Z",
      }),
      expect.objectContaining({
        id: "m4",
        nome_1: "Beto",
        nome_2: "Ana",
        encerradaEm: "2026-06-01T12:00:00Z",
      }),
    ])
  })

  it("histórico inclui encerrada sem participante com 'A definir' (motor a ignora)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    montarClient({
      torneio: TORNEIO,
      partidas: [partidaEncerrada(ana, null, 3, 0)],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    // Registro fiel no histórico…
    expect(r?.partidasEncerradas).toEqual([
      expect.objectContaining({ nome_1: "Ana", nome_2: "A definir" }),
    ])
    // …mas a classificação não pontua partida sem os dois lados.
    expect(r?.linhas).toEqual([])
  })

  it("sem partidas devolve tabela vazia com o torneio (incl. created_by p/ console do dono)", async () => {
    montarClient({ torneio: TORNEIO, partidas: null })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.torneio).toMatchObject({ titulo: "Copa", created_by: "dono-1" })
    expect(r?.linhas).toEqual([])
    expect(r?.partidasAbertas).toEqual([])
  })

  it("partidasAbertas lista só as NÃO-encerradas, com status e fallback de lado", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: TORNEIO,
      partidas: [
        { ...partidaEncerrada(ana, beto, 1, 0), status: "em_andamento" }, // m1
        partidaEncerrada(ana, beto, 2, 2), // m2 (encerrada — fora)
        { ...partidaEncerrada(ana, null, 0, 0), status: "agendada" }, // m3
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasAbertas).toEqual([
      expect.objectContaining({
        id: "m1",
        nome_1: "Ana",
        nome_2: "Beto",
        placar_1: 1,
        placar_2: 0,
        status: "em_andamento",
      }),
      expect.objectContaining({ id: "m3", nome_2: "A definir", status: "agendada" }),
    ])
    // E o histórico segue só com a encerrada — projeções consistentes.
    expect(r?.partidasEncerradas).toEqual([expect.objectContaining({ id: "m2" })])
  })

  it("partidasAbertas de liga ordenam por rodada (avulsa sem rodada vai pro fim)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: { ...TORNEIO, formato: "liga" },
      partidas: [
        { ...partidaEncerrada(ana, beto, 0, 0), status: "agendada", rodada: 3 }, // m1
        { ...partidaEncerrada(beto, ana, 0, 0), status: "agendada", rodada: 1 }, // m2
        { ...partidaEncerrada(ana, beto, 0, 0), status: "agendada", rodada: null }, // m3
        { ...partidaEncerrada(beto, ana, 0, 0), status: "agendada", rodada: 2 }, // m4
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasAbertas.map((p) => p.id)).toEqual(["m2", "m4", "m1", "m3"])
    expect(r?.partidasAbertas.map((p) => p.rodada)).toEqual([1, 2, 3, null])
  })

  it("rodada chega às projeções de histórico e abertas (insumo do rótulo)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: { ...TORNEIO, formato: "liga" },
      partidas: [
        { ...partidaEncerrada(ana, beto, 2, 1), rodada: 1 }, // encerrada
        { ...partidaEncerrada(beto, ana, 0, 0), status: "agendada", rodada: 2 },
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasEncerradas[0]).toMatchObject({ rodada: 1 })
    expect(r?.partidasAbertas[0]).toMatchObject({ rodada: 2 })
    expect(r?.torneio).toMatchObject({ formato: "liga", ida_e_volta: false })
  })
})
