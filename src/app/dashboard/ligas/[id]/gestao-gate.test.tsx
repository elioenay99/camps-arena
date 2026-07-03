// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Ressalva 2 (add-liga-visao-leitura): ao relaxar `getSeason` (deixa de retornar
// null por capacidade), as páginas de GESTÃO /cores e /equipe PRECISAM do gate
// próprio `!podeGerir → notFound`. Sem ele, /equipe vazaria member_invites e a
// gestão de equipe ao leitor. Este guard trava essa regressão.
vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/league/data/getSeason", () => ({ getSeason: vi.fn() }))
// Loaders de equipe: mockados p/ detectar se o gate PASSOU (gestor) ou barrou.
vi.mock("@/features/team-roles/data/getMembros", () => ({
  getMembros: vi.fn(async () => []),
}))
vi.mock("@/features/team-roles/data/getConvitesMembro", () => ({
  getConvitesMembro: vi.fn(async () => []),
}))
// Folhas client (não são o alvo) → neutralizadas.
vi.mock("@/features/championship/components/ChampionshipColorsForm", () => ({
  ChampionshipColorsForm: () => null,
}))
vi.mock("@/features/team-roles/components/AddMemberSearch", () => ({
  AddMemberSearch: () => null,
}))
vi.mock("@/features/team-roles/components/MemberInviteCards", () => ({
  MemberInviteCards: () => null,
}))
vi.mock("@/features/team-roles/components/TeamSection", () => ({
  TeamSection: () => null,
}))

import CoresPage from "@/app/dashboard/ligas/[id]/cores/page"
import EquipePage from "@/app/dashboard/ligas/[id]/equipe/page"
import { createClient } from "@/lib/supabase/server"
import { getSeason } from "@/features/league/data/getSeason"
import { getMembros } from "@/features/team-roles/data/getMembros"

const mockCreateClient = vi.mocked(createClient)
const mockGetSeason = vi.mocked(getSeason)
const mockGetMembros = vi.mocked(getMembros)

const SEASON = "33333333-3333-4333-8333-333333333333"
const USER = "user-1"

function temporada(podeGerir: boolean) {
  return {
    seasonId: SEASON,
    numero: 1,
    status: "ativa",
    ciclo: "anual",
    // criadaPor null: a /equipe pula a query de perfil do dono (users_public).
    competicao: {
      id: "comp-1",
      nome: "Pirâmide",
      criadaPor: null,
      corPrimaria: null,
      corSecundaria: null,
    },
    divisoes: [],
    fronteiras: [],
    competidores: {},
    podeGerir,
  } as unknown as Awaited<ReturnType<typeof getSeason>>
}

function montar(podeGerir: boolean) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
  } as unknown as never)
  mockGetSeason.mockResolvedValue(temporada(podeGerir))
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("gate de gestão /cores e /equipe (!podeGerir → notFound)", () => {
  it("/cores: leitor (não-gestor) recebe notFound", async () => {
    montar(false)
    await expect(
      CoresPage({ params: Promise.resolve({ id: SEASON }) })
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("/equipe: leitor (não-gestor) recebe notFound e NÃO carrega membros/convites", async () => {
    montar(false)
    await expect(
      EquipePage({ params: Promise.resolve({ id: SEASON }) })
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mockGetMembros).not.toHaveBeenCalled()
  })

  it("/equipe: gestor passa do gate (carrega membros)", async () => {
    montar(true)
    await EquipePage({ params: Promise.resolve({ id: SEASON }) })
    expect(mockGetMembros).toHaveBeenCalledWith(
      expect.anything(),
      "league",
      "comp-1"
    )
  })
})
