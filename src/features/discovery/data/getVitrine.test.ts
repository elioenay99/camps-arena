import { beforeEach, describe, expect, it, vi } from "vitest"

// `getVitrine` é server-only e lê o banco via `createClient`. O fake do Supabase
// aplica os filtros `.eq`/`.in` ao dataset por tabela — assim os cenários de
// RESSALVA 3 (liga arquivada / torneio despublicado somem) exercitam de fato os
// filtros `status='ativa'` e `is_public=true`, não só a montagem em JS.
vi.mock("server-only", () => ({}))

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }))

import { getVitrine } from "@/features/discovery/data/getVitrine"

type Row = Record<string, unknown>

/** Query-builder mínimo que HONRA os filtros eq/in e o teto `.limit` (thenable). */
function makeChain(rows: Row[]) {
  const eqs: [string, unknown][] = []
  const ins: [string, unknown[]][] = []
  let teto: number | null = null
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      eqs.push([col, val])
      return chain
    },
    in: (col: string, vals: unknown[]) => {
      ins.push([col, vals])
      return chain
    },
    limit: (n: number) => {
      teto = n
      return chain
    },
    then: (
      onF: (v: { data: Row[]; error: null }) => unknown,
      onR?: (e: unknown) => unknown
    ) => {
      let data = rows
      for (const [col, val] of eqs) data = data.filter((r) => r[col] === val)
      for (const [col, vals] of ins) data = data.filter((r) => vals.includes(r[col]))
      // O teto é aplicado DEPOIS dos filtros, como no PostgREST.
      if (teto !== null) data = data.slice(0, teto)
      return Promise.resolve({ data, error: null }).then(onF, onR)
    },
  }
  return chain
}

function fakeSupabase(datasets: Record<string, Row[]>) {
  return {
    from(table: string) {
      return makeChain(datasets[table] ?? [])
    },
  } as unknown
}

const liga = (over: Row = {}): Row => ({
  id: "comp-1",
  nome: "Liga X",
  created_by: "u1",
  created_at: "2026-01-02T00:00:00Z",
  cor_primaria: null,
  cor_secundaria: null,
  status: "ativa",
  listada: true,
  league_seasons: [
    { id: "s1", numero: 1, status: "ativa" },
    { id: "s2", numero: 2, status: "em_fluxo" },
  ],
  ...over,
})

const torneio = (over: Row = {}): Row => ({
  id: "t-1",
  titulo: "Torneio Y",
  formato: "mata_mata",
  status: "ativo",
  created_by: "u2",
  created_at: "2026-01-05T00:00:00Z",
  cor_primaria: null,
  cor_secundaria: null,
  is_public: true,
  listada: true,
  ...over,
})

beforeEach(() => createClientMock.mockReset())

describe("getVitrine — vitrine pública", () => {
  it("lista liga ativa e torneio público de terceiros; ordena por recência; dono via users_public", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: [liga()],
        tournaments: [torneio()],
        league_division_seasons: [],
        users_public: [
          { id: "u1", nome: "Ana" },
          { id: "u2", nome: "Bruno" },
        ],
      })
    )

    const itens = await getVitrine()

    expect(itens).toHaveLength(2)
    // created_at desc: torneio (01-05) antes da liga (01-02).
    expect(itens[0]).toMatchObject({
      tipo: "torneio",
      href: "/dashboard/torneios/t-1",
      dono: "Bruno",
      formato: "mata_mata",
    })
    // Liga aponta a temporada CORRENTE (maior numero = s2) e seu status.
    expect(itens[1]).toMatchObject({
      tipo: "liga",
      href: "/dashboard/ligas/s2",
      status: "em_fluxo",
      dono: "Ana",
    })
  })

  it("EXCLUI torneio que é divisão de pirâmide (referenciado por league_division_seasons)", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: [],
        tournaments: [torneio({ id: "t-div" })],
        league_division_seasons: [
          {
            tournament_id: "t-div",
            tournament_id_clausura: null,
            final_tournament_id: null,
          },
        ],
        users_public: [],
      })
    )

    const itens = await getVitrine()
    expect(itens).toHaveLength(0)
  })

  it("omite liga sem temporada (league_seasons vazio)", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: [liga({ league_seasons: [] })],
        tournaments: [],
        league_division_seasons: [],
        users_public: [{ id: "u1", nome: "Ana" }],
      })
    )

    const itens = await getVitrine()
    expect(itens).toHaveLength(0)
  })

  it("vitrine vazia: nenhuma competição listada → []", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: [],
        tournaments: [],
        league_division_seasons: [],
        users_public: [],
      })
    )

    expect(await getVitrine()).toEqual([])
  })

  it("RESSALVA 3: liga ARQUIVADA (listada) NÃO aparece (filtro status='ativa')", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: [liga({ id: "comp-arq", status: "arquivada" })],
        tournaments: [],
        league_division_seasons: [],
        users_public: [{ id: "u1", nome: "Ana" }],
      })
    )

    expect(await getVitrine()).toHaveLength(0)
  })

  it("RESSALVA 3: torneio DESPUBLICADO (is_public=false, mas listada) NÃO aparece", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: [],
        tournaments: [torneio({ id: "t-priv", is_public: false })],
        league_division_seasons: [],
        users_public: [{ id: "u2", nome: "Bruno" }],
      })
    )

    expect(await getVitrine()).toHaveLength(0)
  })

  it("teto defensivo: no máximo 60 ligas + 60 torneios (change mobile-nav-densidade)", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        league_competitions: Array.from({ length: 70 }, (_, i) =>
          liga({ id: `comp-${i}` })
        ),
        tournaments: Array.from({ length: 70 }, (_, i) =>
          torneio({ id: `t-${i}` })
        ),
        league_division_seasons: [],
        users_public: [
          { id: "u1", nome: "Ana" },
          { id: "u2", nome: "Bruno" },
        ],
      })
    )

    // O teto não muda filtro nem ordenação — só impede o payload de crescer sem
    // limite. 140 linhas elegíveis entram, 120 saem.
    const itens = await getVitrine()
    expect(itens).toHaveLength(120)
    expect(itens.filter((i) => i.tipo === "liga")).toHaveLength(60)
    expect(itens.filter((i) => i.tipo === "torneio")).toHaveLength(60)
  })
})
