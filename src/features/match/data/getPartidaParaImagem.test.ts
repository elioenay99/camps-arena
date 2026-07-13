import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getPartidaParaImagem } from "@/features/match/data/getPartidaParaImagem"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Mock: from("matches").select(...).eq(id).eq(status).maybeSingle() → {data,error}. */
function mockClient(resp: { data?: unknown; error?: unknown }): ServerClient {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = async () => ({
    data: resp.data ?? null,
    error: resp.error ?? null,
  })
  return { from: () => chain } as unknown as ServerClient
}

const base = {
  id: "m1",
  tournament_id: "t1",
  vaga_1: null as string | null,
  vaga_2: null as string | null,
  participante_1: null as string | null,
  participante_2: null as string | null,
  placar_1: 0,
  placar_2: 0,
  rodada: 3,
  perna: null,
  grupo: null,
  wo: false,
  wo_vencedor: null as string | null,
  wo_duplo: false,
  updated_at: "2026-01-01T00:00:00Z",
  p1: null as unknown,
  p2: null as unknown,
  v1: null as unknown,
  v2: null as unknown,
}

describe("getPartidaParaImagem", () => {
  it("competitivo: nome/escudo vêm das vagas; avatarUrl null", async () => {
    const client = mockClient({
      data: {
        ...base,
        vaga_1: "v1",
        vaga_2: "v2",
        placar_1: 3,
        placar_2: 1,
        v1: { rotulo: null, team: { nome: "Palmeiras", escudo_url: "https://x/p.png" } },
        v2: { rotulo: null, team: { nome: "Santos", escudo_url: null } },
      },
    })
    const p = await getPartidaParaImagem(client, "m1")
    expect(p).toMatchObject({
      nome_1: "Palmeiras",
      nome_2: "Santos",
      escudo_1: "https://x/p.png",
      escudo_2: null,
      avatarUrl_1: null,
      avatarUrl_2: null,
      tournament_id: "t1",
      placar_1: 3,
      placar_2: 1,
    })
  })

  it("avulso: nome/foto vêm dos participantes; escudo null", async () => {
    const client = mockClient({
      data: {
        ...base,
        participante_1: "u1",
        participante_2: "u2",
        placar_1: 2,
        placar_2: 2,
        p1: { nome: "Ana", avatar: "https://x/a.png" },
        p2: { nome: "Beto", avatar: null },
      },
    })
    const p = await getPartidaParaImagem(client, "m1")
    expect(p).toMatchObject({
      nome_1: "Ana",
      nome_2: "Beto",
      escudo_1: null,
      escudo_2: null,
      avatarUrl_1: "https://x/a.png",
      avatarUrl_2: null,
    })
  })

  it("W.O. simples: woVencedorLado deriva do wo_vencedor (= vaga)", async () => {
    const client = mockClient({
      data: {
        ...base,
        vaga_1: "v1",
        vaga_2: "v2",
        wo: true,
        wo_vencedor: "v2",
        v1: { rotulo: "Alfa", team: null },
        v2: { rotulo: "Bravo", team: null },
      },
    })
    const p = await getPartidaParaImagem(client, "m1")
    expect(p?.wo).toBe(true)
    expect(p?.woDuplo).toBe(false)
    expect(p?.woVencedorLado).toBe(2)
  })

  it("W.O. duplo: sem woVencedorLado", async () => {
    const client = mockClient({
      data: {
        ...base,
        vaga_1: "v1",
        vaga_2: "v2",
        wo: true,
        wo_duplo: true,
        wo_vencedor: null,
        v1: { rotulo: "Alfa", team: null },
        v2: { rotulo: "Bravo", team: null },
      },
    })
    const p = await getPartidaParaImagem(client, "m1")
    expect(p?.woDuplo).toBe(true)
    expect(p?.woVencedorLado).toBeNull()
  })

  it("tournament_id null ⇒ null (não renderiza card órfão)", async () => {
    const client = mockClient({ data: { ...base, tournament_id: null } })
    expect(await getPartidaParaImagem(client, "m1")).toBeNull()
  })

  it("partida ausente / erro de IO ⇒ null", async () => {
    expect(await getPartidaParaImagem(mockClient({ data: null }), "m1")).toBeNull()
    expect(
      await getPartidaParaImagem(mockClient({ error: { message: "boom" } }), "m1")
    ).toBeNull()
  })

  it("fallback de nome: lado competitivo sem embed vira 'A definir'; vaga sem clube/rótulo vira 'Sem nome'", async () => {
    const client = mockClient({
      data: {
        ...base,
        vaga_1: "v1",
        vaga_2: "v2",
        v1: { rotulo: null, team: null },
        v2: null, // vaga referenciada mas sem embed (RLS/bye)
      },
    })
    const p = await getPartidaParaImagem(client, "m1")
    expect(p?.nome_1).toBe("Sem nome")
    expect(p?.nome_2).toBe("A definir")
  })
})
