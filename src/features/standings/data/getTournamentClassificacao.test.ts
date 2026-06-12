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

interface VagaFixture {
  id: string
  team: { nome: string | null; escudo_url: string | null } | null
  tecnico: { id: string; nome: string | null; celular: string | null } | null
}

/** Vaga (lado COMPETITIVO): clube + técnico opcional (modelo clube-cêntrico). */
function vagaFixture(
  id: string,
  clube: string | null,
  tecnico: VagaFixture["tecnico"] = null
): VagaFixture {
  return {
    id,
    team: clube === null ? null : { nome: clube, escudo_url: `https://media.api-sports.io/football/teams/${id}.png` },
    tecnico,
  }
}

/**
 * Converte a partida para o modelo COMPETITIVO: lados por VAGA (vaga_1/2 +
 * v1/v2), participante_* nulos (CHECK matches_lado_vaga_ou_user no banco).
 */
function comVagas(
  partida: ReturnType<typeof partidaEncerrada>,
  v1: VagaFixture | null,
  v2: VagaFixture | null
) {
  return {
    ...partida,
    participante_1: null,
    participante_2: null,
    p1: null,
    p2: null,
    vaga_1: v1?.id ?? null,
    vaga_2: v2?.id ?? null,
    v1,
    v2,
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
    expect(cols).toContain("p1:users!matches_participante_1_fkey(id,nome,celular,avatar)")
    expect(cols).toContain("p2:users!matches_participante_2_fkey(id,nome,celular,avatar)")
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
    // Lados competitivos (modelo clube-cêntrico): colunas cruas vaga_* (insumo
    // do motor) + embed da VAGA com clube e técnico, FK-hints explícitos.
    expect(cols).toMatch(/(^|,)vaga_1(,|$)/)
    expect(cols).toMatch(/(^|,)vaga_2(,|$)/)
    expect(cols).toContain(
      "v1:tournament_slots!matches_vaga_1_fkey(id,rotulo,team:teams!tournament_slots_team_id_fkey(nome,escudo_url),tecnico:users!tournament_slots_user_id_fkey(id,nome,celular))"
    )
    expect(cols).toContain(
      "v2:tournament_slots!matches_vaga_2_fkey(id,rotulo,team:teams!tournament_slots_team_id_fkey(nome,escudo_url),tecnico:users!tournament_slots_user_id_fkey(id,nome,celular))"
    )
    // celular entrou DELIBERADAMENTE (add-match-engagement): insumo do atalho
    // de convocação, consumido só pela projeção de partidas abertas — a
    // contenção de PII é validada no teste de convocação abaixo.
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

  it("select do torneio inclui terceiro_lugar (insumo do mata-mata com 3º lugar)", async () => {
    const torneioSelectSpy = vi.fn()
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((cols: unknown) => {
          torneioSelectSpy(cols)
          return {
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          }
        }),
      })),
    }
    mockCreateClient.mockResolvedValue(client as unknown as never)
    await getTournamentClassificacao(TORNEIO.id)
    // Coluna que habilita a disputa de 3º lugar na projeção do mata-mata.
    const cols = String(torneioSelectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    expect(cols).toMatch(/(^|,)terceiro_lugar(,|$)/)
  })

  it("select de partidas inclui posicao e perna (slot e perna da chave)", async () => {
    const client = montarClient({ torneio: TORNEIO, partidas: [] })
    await getTournamentClassificacao(TORNEIO.id)
    const cols = String(client.partidasSelectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    // Regex ancorada: `posicao`/`perna` são colunas cruas de TOPO (o embed
    // `(id,nome)` não contém estas substrings, mas mantemos o padrão do arquivo).
    expect(cols).toMatch(/(^|,)posicao(,|$)/)
    expect(cols).toMatch(/(^|,)perna(,|$)/)
  })

  it("chave projeta partidas com rodada+posicao ordenadas por rodada/posicao/perna com nomes resolvidos", async () => {
    // Competitivo: o lado é a VAGA e o nome resolvido é o CLUBE dela.
    const ana = vagaFixture("s1", "Ana FC")
    const beto = vagaFixture("s2", "Beto FC")
    const caio = vagaFixture("s3", "Caio FC")
    const duda = vagaFixture("s4", "Duda FC")
    montarClient({
      torneio: { ...TORNEIO, formato: "mata_mata", ida_e_volta: true },
      partidas: [
        // Embaralhadas na entrada para provar a ordenação rodada→posicao→perna.
        { ...comVagas(partidaEncerrada(null, null, 1, 0), caio, duda), rodada: 1, posicao: 2, perna: 1 }, // m1
        { ...comVagas(partidaEncerrada(null, null, 2, 1), ana, beto), rodada: 2, posicao: 1, perna: 1 }, // m2 (final)
        { ...comVagas(partidaEncerrada(null, null, 3, 0), ana, beto), rodada: 1, posicao: 1, perna: 1 }, // m3
        { ...comVagas(partidaEncerrada(null, null, 0, 2), beto, ana), rodada: 1, posicao: 1, perna: 2 }, // m4
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.chave.map((p) => p.id)).toEqual(["m3", "m4", "m1", "m2"])
    expect(r?.chave[0]).toMatchObject({
      rodada: 1,
      posicao: 1,
      perna: 1,
      // O id do lado da chave é o SLOT (pareamento de vencedor no bracket).
      participante_1: "s1",
      participante_2: "s2",
      nome_1: "Ana FC",
      nome_2: "Beto FC",
      placar_1: 3,
      placar_2: 0,
      status: "encerrada",
    })
  })

  it("partidas sem posicao (liga/avulso) ficam FORA da chave", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: { ...TORNEIO, formato: "liga" },
      partidas: [
        { ...partidaEncerrada(ana, beto, 1, 0), rodada: 1 }, // liga: rodada sem slot
        partidaEncerrada(beto, ana, 2, 0), // avulsa: sem rodada nem slot
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.chave).toEqual([])
  })

  it("bye de chave (um lado nulo + posicao) fica DENTRO da chave mas FORA das encerradas/abertas", async () => {
    // Bye competitivo: vaga_2 NULA (o lado vazio é avaliado pelo id cru do
    // formato — a vaga, não o participante).
    const ana = vagaFixture("s1", "Ana FC")
    montarClient({
      torneio: { ...TORNEIO, formato: "mata_mata" },
      partidas: [
        // Bye encerrado: avanço direto, não um jogo — ruído no histórico.
        { ...comVagas(partidaEncerrada(null, null, 0, 0), ana, null), rodada: 1, posicao: 1, perna: null }, // m1
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasEncerradas).toEqual([])
    expect(r?.partidasAbertas).toEqual([])
    expect(r?.chave.map((p) => p.id)).toEqual(["m1"])
    expect(r?.chave[0]).toMatchObject({ nome_1: "Ana FC", nome_2: "A definir" })
  })

  it("partidasAbertas de mata-mata ordenam por rodada→posicao→perna", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: { ...TORNEIO, formato: "mata_mata", ida_e_volta: true },
      partidas: [
        // Mesma rodada/slot, pernas trocadas: perna desempata.
        { ...partidaEncerrada(ana, beto, 0, 0), status: "agendada", rodada: 1, posicao: 1, perna: 2 }, // m1
        { ...partidaEncerrada(beto, ana, 0, 0), status: "agendada", rodada: 1, posicao: 2, perna: 1 }, // m2
        { ...partidaEncerrada(ana, beto, 0, 0), status: "agendada", rodada: 1, posicao: 1, perna: 1 }, // m3
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasAbertas.map((p) => p.id)).toEqual(["m3", "m1", "m2"])
  })

  it("perna chega às projeções de histórico e abertas (insumo do rótulo ida/volta)", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: { ...TORNEIO, formato: "mata_mata", ida_e_volta: true },
      partidas: [
        { ...partidaEncerrada(ana, beto, 2, 1), rodada: 1, posicao: 1, perna: 1 }, // encerrada
        { ...partidaEncerrada(beto, ana, 0, 0), status: "agendada", rodada: 1, posicao: 1, perna: 2 }, // aberta
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasEncerradas[0]).toMatchObject({ perna: 1 })
    expect(r?.partidasAbertas[0]).toMatchObject({ perna: 2 })
  })

  it("select de partidas inclui grupo (insumo da classificação por grupo)", async () => {
    const client = montarClient({ torneio: TORNEIO, partidas: [] })
    await getTournamentClassificacao(TORNEIO.id)
    const cols = String(client.partidasSelectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    // Regex ancorada: `grupo` é coluna crua de TOPO; `toContain("grupo")` daria
    // falso positivo em qualquer alias/coluna que contenha a substring.
    expect(cols).toMatch(/(^|,)grupo(,|$)/)
  })

  it("select do torneio inclui classificados_por_grupo (K do formato de grupos)", async () => {
    const torneioSelectSpy = vi.fn()
    const client = {
      from: vi.fn(() => ({
        select: vi.fn((cols: unknown) => {
          torneioSelectSpy(cols)
          return {
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          }
        }),
      })),
    }
    mockCreateClient.mockResolvedValue(client as unknown as never)
    await getTournamentClassificacao(TORNEIO.id)
    const cols = String(torneioSelectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    expect(cols).toMatch(/(^|,)classificados_por_grupo(,|$)/)
  })

  it("classifica POR GRUPO via subconjunto: grupos distintos não se misturam e saem ordenados pelo número", async () => {
    // Competitivo: o motor por grupo roda sobre os SLOT ids (vagas) e o nome
    // da linha é o clube da vaga.
    const ana = vagaFixture("s1", "Ana FC")
    const beto = vagaFixture("s2", "Beto FC")
    const caio = vagaFixture("s3", "Caio FC")
    const duda = vagaFixture("s4", "Duda FC")
    montarClient({
      torneio: { ...TORNEIO, formato: "grupos_mata_mata", classificados_por_grupo: 1 },
      partidas: [
        // Entram fora de ordem (grupo 2 antes do 1) para provar a ordenação.
        { ...comVagas(partidaEncerrada(null, null, 3, 0), caio, duda), grupo: 2, rodada: 1 },
        { ...comVagas(partidaEncerrada(null, null, 2, 1), ana, beto), grupo: 1, rodada: 1 },
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    // Dois grupos, ordenados pelo número do grupo (1 antes de 2).
    expect(r?.grupos.map((g) => g.grupo)).toEqual([1, 2])
    // Subconjunto: o grupo 1 só conhece Ana/Beto; o 2 só Caio/Duda — sem
    // contaminação cruzada entre grupos distintos.
    expect(r?.grupos[0].linhas.map((l) => l.nome)).toEqual(["Ana FC", "Beto FC"])
    expect(r?.grupos[1].linhas.map((l) => l.nome)).toEqual(["Caio FC", "Duda FC"])
    // E o vencedor de cada grupo fica em 1º (motor rodou só o subconjunto).
    expect(r?.grupos[0].linhas[0]).toMatchObject({ nome: "Ana FC", posicao: 1 })
    expect(r?.grupos[1].linhas[0]).toMatchObject({ nome: "Caio FC", posicao: 1 })
  })

  it("torneio sem partidas de grupo (ex.: mata-mata) projeta grupos vazios", async () => {
    const ana = { id: "u1", nome: "Ana" }
    const beto = { id: "u2", nome: "Beto" }
    montarClient({
      torneio: { ...TORNEIO, formato: "mata_mata" },
      partidas: [
        // Sem coluna grupo → nenhuma classificação por grupo.
        { ...partidaEncerrada(ana, beto, 1, 0), rodada: 1, posicao: 1, perna: 1, grupo: null },
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.grupos).toEqual([])
  })
})

describe("display competitivo — clube como lado, técnico como detalhe", () => {
  const TEC_ANA = { id: "u1", nome: "Ana", celular: "11912345678" }

  it("linhas classificam VAGAS (nome do clube + escudo) e `clubes` fica vazia", async () => {
    const v1 = vagaFixture("s1", "Grêmio", TEC_ANA)
    const v2 = vagaFixture("s2", "Inter")
    montarClient({
      torneio: { ...TORNEIO, formato: "liga", pontos_vitoria: 2 },
      partidas: [{ ...comVagas(partidaEncerrada(null, null, 1, 0), v1, v2), rodada: 1 }],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.linhas).toEqual([
      expect.objectContaining({
        participanteId: "s1",
        nome: "Grêmio",
        escudoUrl: "https://media.api-sports.io/football/teams/s1.png",
        posicao: 1,
        pontos: 2,
      }),
      expect.objectContaining({ participanteId: "s2", nome: "Inter", pontos: 0 }),
    ])
    // No competitivo o lado JÁ É o clube — a projeção `clubes` (recurso do
    // avulso) fica vazia para a página não exibir a seção redundante.
    expect(r?.clubes).toEqual([])
  })

  it("encerradas/abertas competitivas carregam clube, escudo e técnico; contato é o TÉCNICO", async () => {
    const v1 = vagaFixture("s1", "Grêmio", TEC_ANA)
    const v2 = vagaFixture("s2", "Inter") // vaga ÓRFÃ (sem técnico)
    const fechada = { ...comVagas(partidaEncerrada(null, null, 2, 1), v1, v2), rodada: 1 }
    const aberta = {
      ...comVagas(partidaEncerrada(null, null, 0, 0), v1, v2),
      status: "agendada",
      rodada: 2,
    }
    montarClient({
      torneio: { ...TORNEIO, formato: "liga" },
      partidas: [fechada, aberta],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasEncerradas[0]).toMatchObject({
      nome_1: "Grêmio",
      nome_2: "Inter",
      escudo_1: "https://media.api-sports.io/football/teams/s1.png",
      tecnico_1: { id: "u1", nome: "Ana" },
      tecnico_2: null,
    })
    // Convocação competitiva: o contato é o técnico da vaga; vaga órfã não
    // tem quem chamar (null).
    expect(r?.partidasAbertas[0]).toMatchObject({
      nome_1: "Grêmio",
      participante_1: { id: "u1", celular: "11912345678" },
      participante_2: null,
      tecnico_1: { id: "u1", nome: "Ana" },
    })
    // O técnico do histórico NÃO carrega celular (PII contida às abertas).
    expect(r?.partidasEncerradas[0].tecnico_1).not.toHaveProperty("celular")
  })

  it("vaga vazia (lado nulo) em partida de liga aparece como 'A definir'", async () => {
    const v1 = vagaFixture("s1", "Grêmio")
    montarClient({
      torneio: { ...TORNEIO, formato: "liga" },
      partidas: [
        { ...comVagas(partidaEncerrada(null, null, 1, 0), v1, null), rodada: 1 },
      ],
    })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasEncerradas[0]).toMatchObject({
      nome_1: "Grêmio",
      nome_2: "A definir",
    })
    // O motor exige os dois lados: partida com vaga nula não pontua.
    expect(r?.linhas).toEqual([])
  })
})

describe("convocação — celular nos embeds e lados nas partidas abertas", () => {
  it("partidasAbertas carrega ids/celulares dos lados; encerradas NÃO", async () => {
    const aberta = {
      ...partidaEncerrada(
        { id: "u1", nome: "Ana", celular: "11912345678" } as never,
        { id: "u2", nome: "Beto", celular: null } as never,
        1,
        0
      ),
      status: "em_andamento",
    }
    const fechada = partidaEncerrada(
      { id: "u1", nome: "Ana", celular: "11912345678" } as never,
      { id: "u2", nome: "Beto", celular: null } as never,
      2,
      1
    )
    montarClient({ torneio: TORNEIO, partidas: [aberta, fechada] })
    const r = await getTournamentClassificacao(TORNEIO.id)
    expect(r?.partidasAbertas[0]).toMatchObject({
      participante_1: { id: "u1", celular: "11912345678" },
      participante_2: { id: "u2", celular: null },
    })
    // O histórico não expõe o dado (PII contida à projeção que o usa).
    expect(r?.partidasEncerradas[0]).not.toHaveProperty("participante_1")
  })
})
