import { describe, it, expect } from "vitest"

import { getTecnicoProfile } from "./getTecnicoProfile"

interface TenureRow {
  competitor_id: string
  season_id: string | null
  encerrada_em: string | null
  competitor: {
    id: string
    rotulo: string | null
    team: { nome: string | null; escudo_url: string | null } | null
    competition: { id: string; nome: string } | null
  } | null
}

/**
 * Supabase fake: users (select→eq→maybeSingle) + coach_tenures (select→eq→await).
 */
function fakeSupabase(opts: {
  user?: { id: string; nome: string | null } | null
  userError?: boolean
  tenures?: TenureRow[] | null
  tenuresError?: boolean
}) {
  const userResult = {
    data: opts.userError ? null : (opts.user ?? null),
    error: opts.userError ? new Error("io") : null,
  }
  const tenuresResult = {
    data: opts.tenuresError ? null : (opts.tenures ?? []),
    error: opts.tenuresError ? new Error("io") : null,
  }
  return {
    from(table: string) {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => userResult }),
          }),
        }
      }
      if (table === "coach_tenures") {
        const chain = {
          select: () => chain,
          eq: () => Promise.resolve(tenuresResult),
        }
        return chain
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
  } as never
}

function tenure(competitorId: string, extra: Partial<TenureRow> = {}): TenureRow {
  return {
    competitor_id: competitorId,
    season_id: "s1",
    encerrada_em: null,
    competitor: {
      id: competitorId,
      rotulo: null,
      team: { nome: "Clube " + competitorId, escudo_url: "e.png" },
      competition: { id: "comp1", nome: "Pirâmide" },
    },
    ...extra,
  }
}

describe("getTecnicoProfile", () => {
  it("usuário inexistente ⇒ null (404)", async () => {
    expect(await getTecnicoProfile(fakeSupabase({ user: null }), { userId: "u1" })).toBeNull()
  })

  it("erro ao ler users ⇒ null (404)", async () => {
    expect(
      await getTecnicoProfile(fakeSupabase({ userError: true }), { userId: "u1" })
    ).toBeNull()
  })

  it("agrega clubes por competidor (temporadas distintas, vigência, totais)", async () => {
    const rows = [
      tenure("cA", { season_id: "s1", encerrada_em: "2026-06-01T00:00:00Z" }),
      tenure("cA", { season_id: "s2", encerrada_em: null }), // vigente + 2ª temporada
      tenure("cB", { season_id: "s1", encerrada_em: "2026-05-01T00:00:00Z" }),
    ]
    const perfil = await getTecnicoProfile(
      fakeSupabase({ user: { id: "u1", nome: "Ana" }, tenures: rows }),
      { userId: "u1" }
    )
    expect(perfil).not.toBeNull()
    expect(perfil!.nome).toBe("Ana")
    expect(perfil!.totalClubes).toBe(2)
    // cA: 2 temporadas distintas (s1,s2), vigente; cB: 1 temporada, não vigente.
    const cA = perfil!.clubes.find((c) => c.competitorId === "cA")!
    const cB = perfil!.clubes.find((c) => c.competitorId === "cB")!
    expect(cA.temporadas).toBe(2)
    expect(cA.vigente).toBe(true)
    expect(cB.temporadas).toBe(1)
    expect(cB.vigente).toBe(false)
    expect(perfil!.totalTemporadas).toBe(3)
    // Clube vigente vem primeiro.
    expect(perfil!.clubes[0].competitorId).toBe("cA")
  })

  it("competidor por NOME (rotulo): usa o rótulo e escudo null", async () => {
    const rows = [
      tenure("cN", {
        competitor: {
          id: "cN",
          rotulo: "Feras FC",
          team: null,
          competition: { id: "comp1", nome: "Pirâmide" },
        },
      }),
    ]
    const perfil = await getTecnicoProfile(
      fakeSupabase({ user: { id: "u1", nome: "Ana" }, tenures: rows }),
      { userId: "u1" }
    )
    expect(perfil!.clubes[0]).toMatchObject({ nome: "Feras FC", escudoUrl: null })
  })

  it("usuário real sem histórico visível ⇒ perfil com clubes:[] (não 404)", async () => {
    const perfil = await getTecnicoProfile(
      fakeSupabase({ user: { id: "u1", nome: "Ana" }, tenures: [] }),
      { userId: "u1" }
    )
    expect(perfil).not.toBeNull()
    expect(perfil!.clubes).toEqual([])
    expect(perfil!.totalClubes).toBe(0)
  })

  it("erro ao ler tenures ⇒ perfil válido com clubes:[] (degrada)", async () => {
    const perfil = await getTecnicoProfile(
      fakeSupabase({ user: { id: "u1", nome: "Ana" }, tenuresError: true }),
      { userId: "u1" }
    )
    expect(perfil).not.toBeNull()
    expect(perfil!.clubes).toEqual([])
  })
})
