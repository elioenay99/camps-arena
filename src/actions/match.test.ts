import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocks dos módulos que a action importa (definidos com vi.fn dentro da
// factory, que é hoisteada; acessados depois via vi.mocked).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { revalidatePath } from "next/cache"

import { updateMatchScore } from "@/actions/match"
import { createClient } from "@/lib/supabase/server"

const mockRevalidate = vi.mocked(revalidatePath)
const mockCreateClient = vi.mocked(createClient)

const UUID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const OUTRO_ID = "33333333-3333-4333-8333-333333333333"
const entradaValida = { matchId: UUID, placar_1: 3, placar_2: 1 }

interface Cenario {
  user?: { id: string } | null
  authError?: { message: string } | null
  /** Retorno da RPC `pode_arbitrar_torneio` (capacidade de arbitrar). Só é
   * consultada no caminho NÃO-avulso; default false. */
  arbitra?: boolean
  readData?: {
    id: string
    participante_1: string | null
    participante_2: string | null
    status?: string
    // Lados por VAGA (competitivo): embed to-one do técnico atual.
    vaga_1?: { user_id: string | null } | null
    vaga_2?: { user_id: string | null } | null
  } | null
  readError?: { message: string } | null
  writeData?: { id: string }[] | null
  writeError?: { message: string } | null
}

/**
 * Cliente Supabase falso com a forma encadeável que a action usa. Expõe spies
 * para o nome da tabela (`from`), os filtros `.eq` de leitura/escrita e o
 * payload do `.update` — assim o teste valida não só o retorno, mas QUAL linha
 * é tocada e COM quê (barreira contra escrever na partida errada).
 */
function montarClient(c: Cenario) {
  const updateSpy = vi.fn()
  const readEqSpy = vi.fn()
  const writeEqSpy = vi.fn()
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: c.user ?? null }, error: c.authError ?? null }),
    },
    // podeArbitrar() delega à RPC pode_arbitrar_torneio (só no caminho não-avulso).
    rpc: vi.fn(async () => ({ data: c.arbitra ?? false, error: null })),
    from: vi.fn(() => ({
      // Leitura: select(...).eq("id", matchId).maybeSingle()
      select: vi.fn(() => ({
        eq: vi.fn((coluna: string, valor: unknown) => {
          readEqSpy(coluna, valor)
          return {
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: c.readData ?? null, error: c.readError ?? null }),
          }
        }),
      })),
      // Escrita: update({...}).eq("id", matchId).select("id")
      update: vi.fn((vals: unknown) => {
        updateSpy(vals)
        return {
          eq: vi.fn((coluna: string, valor: unknown) => {
            writeEqSpy(coluna, valor)
            return {
              select: vi
                .fn()
                .mockResolvedValue({ data: c.writeData ?? null, error: c.writeError ?? null }),
            }
          }),
        }
      }),
    })),
    updateSpy,
    readEqSpy,
    writeEqSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("updateMatchScore", () => {
  it("rejeita entrada inválida sem tocar no banco", async () => {
    const r = await updateMatchScore({ matchId: "x", placar_1: -1, placar_2: 0 })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("Placar inválido.")
      // fieldErrors alimenta a UI: confirma o mapeamento campo→erros.
      expect(r.fieldErrors).toBeDefined()
      expect(r.fieldErrors?.matchId).toBeDefined()
      expect(r.fieldErrors?.placar_1).toBeDefined()
    }
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita usuário não autenticado (sem sessão)", async () => {
    const client = montarClient({ user: null })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("autenticado")
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quando getUser retorna erro (JWT inválido/expirado)", async () => {
    // Cobre o operando `authError` da guarda — caso que motiva usar getUser.
    const client = montarClient({
      user: { id: USER_ID },
      authError: { message: "AuthSessionMissingError" },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("autenticado")
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quando a partida não existe", async () => {
    const client = montarClient({ user: { id: USER_ID }, readData: null })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Partida não encontrada.")
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita placar em partida ENCERRADA com mensagem específica, sem UPDATE", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: USER_ID,
        participante_2: OUTRO_ID,
        status: "encerrada",
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/encerrada/i)
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quando a leitura falha", async () => {
    const client = montarClient({ user: { id: USER_ID }, readError: { message: "boom" } })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Não foi possível carregar a partida.")
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quem não participa da partida e não escreve", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: OUTRO_ID, participante_2: null },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Você não participa desta partida.")
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("persiste e revalida quando o usuário é o participante_1", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      writeData: [{ id: UUID }],
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    // Toca a tabela e a LINHA corretas (leitura e escrita no mesmo matchId).
    expect(client.from).toHaveBeenCalledWith("matches")
    expect(client.readEqSpy).toHaveBeenCalledWith("id", UUID)
    expect(client.writeEqSpy).toHaveBeenCalledWith("id", UUID)
    // Segurança: só placares no payload (sem reatribuir participantes/torneio).
    expect(client.updateSpy).toHaveBeenCalledWith({ placar_1: 3, placar_2: 1 })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
  })

  it("aceita também o participante_2 com o mesmo efeito (simetria)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: OUTRO_ID, participante_2: USER_ID },
      writeData: [{ id: UUID }],
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    expect(client.writeEqSpy).toHaveBeenCalledWith("id", UUID)
    expect(client.updateSpy).toHaveBeenCalledWith({ placar_1: 3, placar_2: 1 })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
  })

  it("competitivo: o TÉCNICO da vaga_1 NÃO grava direto — é mandado para a proposta", async () => {
    // Sem capacidade de arbitrar (arbitra:false): o técnico da vaga propõe com
    // foto em vez de gravar direto (change add-proposta-resultado-foto).
    const client = montarClient({
      user: { id: USER_ID },
      arbitra: false,
      readData: {
        id: UUID,
        participante_1: null,
        participante_2: null,
        vaga_1: { user_id: USER_ID },
        vaga_2: { user_id: OUTRO_ID },
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.error).toBe("Envie o placar para aprovação com a foto de evidência.")
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("competitivo: o TÉCNICO da vaga_2 também NÃO grava direto (simetria por vaga)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      arbitra: false,
      readData: {
        id: UUID,
        participante_1: null,
        participante_2: null,
        vaga_1: { user_id: OUTRO_ID },
        vaga_2: { user_id: USER_ID },
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.error).toBe("Envie o placar para aprovação com a foto de evidência.")
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("competitivo: o ÁRBITRO (não joga) lança o placar DIRETO", async () => {
    // arbitra:true → mesmo não sendo técnico de nenhuma vaga, grava direto.
    const client = montarClient({
      user: { id: USER_ID },
      arbitra: true,
      readData: {
        id: UUID,
        participante_1: null,
        participante_2: null,
        vaga_1: { user_id: OUTRO_ID },
        vaga_2: { user_id: null },
      },
      writeData: [{ id: UUID }],
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    expect(client.updateSpy).toHaveBeenCalledWith({ placar_1: 3, placar_2: 1 })
  })

  it("competitivo: vaga ÓRFÃ (técnico null) não dá acesso e não escreve", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: null,
        participante_2: null,
        // A MINHA vaga está vazia; só o dono age sobre ela (caminho de dono).
        vaga_1: { user_id: null },
        vaga_2: { user_id: OUTRO_ID },
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Você não participa desta partida.")
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("competitivo: técnico de OUTRO clube (nenhuma vaga minha) é rejeitado", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: null,
        participante_2: null,
        vaga_1: { user_id: OUTRO_ID },
        vaga_2: { user_id: null },
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Você não participa desta partida.")
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("rejeita quando o UPDATE falha", async () => {
    montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      writeError: { message: "boom" },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Não foi possível salvar o placar.")
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("trata corrida: 0 linhas afetadas após a checagem (RLS/partida sumiu)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      writeData: [],
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("alterada")
    // O UPDATE foi tentado (a mensagem "alterada" só é alcançável pós-escrita).
    expect(client.updateSpy).toHaveBeenCalledWith({ placar_1: 3, placar_2: 1 })
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})
