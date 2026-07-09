import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/league/data/getConfrontoTecnicos", () => ({
  getConfrontoTecnicos: vi.fn(),
}))

import { carregarConfrontoTecnicos } from "@/actions/insights"
import { createClient } from "@/lib/supabase/server"
import { getConfrontoTecnicos } from "@/features/league/data/getConfrontoTecnicos"
import type { ConfrontoDireto } from "@/features/standings/insights"

const mockCreateClient = vi.mocked(createClient)
const mockFetcher = vi.mocked(getConfrontoTecnicos)

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

const RETROSPECTO: ConfrontoDireto = {
  jogos: [
    {
      matchId: "m1",
      rodada: 3,
      criadaEm: "2026-01-01T00:00:00.000Z",
      placarA: 2,
      placarB: 1,
      resultadoA: "V",
      wo: false,
      woDuplo: false,
    },
  ],
  aVitorias: 1,
  empates: 0,
  bVitorias: 0,
  duploWo: 0,
  aDerrotas: 0,
  bDerrotas: 1,
  aGolsPro: 2,
  aGolsContra: 1,
}

describe("carregarConfrontoTecnicos", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uuid inválido → vazio, sem tocar o fetcher nem o client", async () => {
    const r = await carregarConfrontoTecnicos("nao-uuid", B)
    expect(r.jogos).toEqual([])
    expect(mockFetcher).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("auto-confronto (A == B) → vazio, sem tocar o fetcher", async () => {
    const r = await carregarConfrontoTecnicos(A, A)
    expect(r.jogos).toEqual([])
    expect(mockFetcher).not.toHaveBeenCalled()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("uuids válidos e distintos → delega ao fetcher", async () => {
    const fakeClient = {} as never
    mockCreateClient.mockResolvedValue(fakeClient)
    mockFetcher.mockResolvedValue(RETROSPECTO)

    const r = await carregarConfrontoTecnicos(A, B)
    expect(mockFetcher).toHaveBeenCalledWith(fakeClient, { userAId: A, userBId: B })
    expect(r).toBe(RETROSPECTO)
  })
})
