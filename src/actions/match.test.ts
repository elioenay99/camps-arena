import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocks dos módulos que a action importa (definidos com vi.fn dentro da
// factory, que é hoisteada; acessados depois via vi.mocked).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// `after()` agenda o push FORA do caminho crítico (F3). No teste ele é no-op — a
// notificação é best-effort e coberta em outro lugar; aqui só validamos o save.
vi.mock("next/server", () => ({ after: vi.fn() }))

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
  /** Proposta de placar PENDENTE para a partida (só consultada no caminho
   * NÃO-avulso, ANTES da RPC). Default null = nenhuma pendente. */
  propostaPendente?: { id: string } | null
  /** Erro simulado da RPC transacional `aplicar_placar_direto` (raise → message). */
  rpcError?: { message: string } | null
}

/**
 * Cliente Supabase falso com a forma encadeável que a action usa. A gravação
 * agora é ATÔMICA numa RPC (`aplicar_placar_direto`) — o mock ramifica `rpc` por
 * nome de função (a autz `pode_arbitrar_torneio` vs a escrita transacional) e
 * captura os argumentos passados à RPC de placar (barreira: valida QUAL partida,
 * placar e autores são gravados, e a guarda otimista `p_expected_status`).
 */
function montarClient(c: Cenario) {
  const readEqSpy = vi.fn()
  const proposalEqSpy = vi.fn()
  const placarRpcSpy = vi.fn()
  const client = {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: c.user ?? null }, error: c.authError ?? null }),
    },
    // Duas RPCs distintas: pode_arbitrar_torneio (autz, só no caminho não-avulso)
    // e aplicar_placar_direto (a escrita transacional, writer autoritativo).
    rpc: vi.fn(async (fn: string, args: unknown) => {
      if (fn === "aplicar_placar_direto") {
        placarRpcSpy(args)
        return { data: c.rpcError ? null : UUID, error: c.rpcError ?? null }
      }
      // pode_arbitrar_torneio (e qualquer outra) devolve a capacidade simulada.
      return { data: c.arbitra ?? false, error: null }
    }),
    from: vi.fn((tabela: string) => {
      // Guarda de proposta pendente (caminho não-avulso, ANTES da RPC):
      // select("id").eq("match_id", …).eq("status", "pendente").limit(1).maybeSingle()
      if (tabela === "match_score_proposals") {
        const builder = {
          eq: vi.fn((coluna: string, valor: unknown) => {
            proposalEqSpy(coluna, valor)
            return builder
          }),
          limit: vi.fn(() => builder),
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: c.propostaPendente ?? null, error: null }),
        }
        return { select: vi.fn(() => builder) }
      }
      // Leitura da partida: select(...).eq("id", matchId).maybeSingle()
      return {
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
      }
    }),
    readEqSpy,
    proposalEqSpy,
    placarRpcSpy,
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quando a partida não existe", async () => {
    const client = montarClient({ user: { id: USER_ID }, readData: null })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Partida não encontrada.")
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita placar em partida ENCERRADA com mensagem específica, sem RPC", async () => {
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quando a leitura falha", async () => {
    const client = montarClient({ user: { id: USER_ID }, readError: { message: "boom" } })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Não foi possível carregar a partida.")
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita quem não participa da partida e não chama a RPC", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: OUTRO_ID, participante_2: null },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Você não participa desta partida.")
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("persiste e revalida quando o usuário é o participante_1", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: USER_ID,
        participante_2: OUTRO_ID,
        status: "agendada",
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    // Lê a partida certa e delega a escrita à RPC transacional com a LINHA + placar
    // corretos e a guarda otimista pelo status lido.
    expect(client.from).toHaveBeenCalledWith("matches")
    expect(client.readEqSpy).toHaveBeenCalledWith("id", UUID)
    expect(client.placarRpcSpy).toHaveBeenCalledWith({
      p_match_id: UUID,
      p_placar_1: 3,
      p_placar_2: 1,
      p_autores: null,
      p_expected_status: "agendada",
    })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
  })

  it("sem autores passa p_autores null (PRESERVA os gols)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({ p_autores: null })
    )
  })

  it("com autores enviado passa o array AGREGADO à RPC (REPLACE dos dois lados)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore({
      ...entradaValida,
      autores: [
        { lado: 1, jogador: "Endrick", gols: 2, contra: false },
        { lado: 1, jogador: "Vini", gols: 1, contra: false },
        { lado: 2, jogador: "João", gols: 1, contra: false },
      ],
    })
    expect(r.ok).toBe(true)
    // agregarAutores casa os buckets do índice parcial e preserva as entradas.
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        p_autores: [
          { lado: 1, jogador: "Endrick", gols: 2, contra: false },
          { lado: 1, jogador: "Vini", gols: 1, contra: false },
          { lado: 2, jogador: "João", gols: 1, contra: false },
        ],
      })
    )
  })

  it("autores de UM lado deixa o array só com aquele lado (a RPC esvazia o oposto)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore({
      ...entradaValida,
      autores: [{ lado: 1, jogador: "Endrick", gols: 2, contra: false }],
    })
    expect(r.ok).toBe(true)
    // O array traz só o lado 1; a RPC (REPLACE dos dois) esvazia o lado 2.
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        p_autores: [{ lado: 1, jogador: "Endrick", gols: 2, contra: false }],
      })
    )
  })

  it("gol contra anônimo vai com jogador undefined no array agregado", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore({
      matchId: UUID,
      placar_1: 3,
      placar_2: 0,
      autores: [
        { lado: 1, jogador: "Vini", gols: 2, contra: false },
        { lado: 1, gols: 1, contra: true },
      ],
    })
    expect(r.ok).toBe(true)
    // agregarAutores transforma o anônimo em `jogador: undefined`; a RPC grava null.
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        p_autores: [
          { lado: 1, jogador: "Vini", gols: 2, contra: false },
          { lado: 1, jogador: undefined, gols: 1, contra: true },
        ],
      })
    )
  })

  it("com autores vazio (tocado) passa p_autores [] (REPLACE que esvazia os dois)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore({ ...entradaValida, autores: [] })
    expect(r.ok).toBe(true)
    // `[]` (não undefined) → REPLACE que limpa os dois lados. Distinto de preservar.
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({ p_autores: [] })
    )
  })

  it("campo autores AUSENTE preserva (p_autores null), distinto de [] enviado", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    const args = client.placarRpcSpy.mock.calls[0]?.[0] as { p_autores: unknown }
    expect(args.p_autores).toBeNull()
  })

  it("rejeita autores excedendo o placar (Zod), sem chamar a RPC", async () => {
    const client = montarClient({ user: { id: USER_ID } })
    const r = await updateMatchScore({
      matchId: UUID,
      placar_1: 1,
      placar_2: 0,
      autores: [{ lado: 1, jogador: "Endrick", gols: 2, contra: false }],
    })
    expect(r.ok).toBe(false)
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
  })

  it("aceita também o participante_2 com o mesmo efeito (simetria)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: OUTRO_ID,
        participante_2: USER_ID,
        status: "em_andamento",
      },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        p_match_id: UUID,
        p_placar_1: 3,
        p_placar_2: 1,
        p_expected_status: "em_andamento",
      })
    )
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
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
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({ p_placar_1: 3, p_placar_2: 1 })
    )
  })

  it("competitivo: vaga ÓRFÃ (técnico null) não dá acesso e não chama a RPC", async () => {
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
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
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
  })

  it("competitivo: com PROPOSTA pendente, o árbitro é recusado limpo e NÃO chama a RPC", async () => {
    // O árbitro (arbitra:true) normalmente grava direto; mas havendo uma proposta
    // de placar aguardando aprovação, a action recusa com mensagem clara (não o
    // "unexpected response") e não escreve — fecha a corrida de aba velha.
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
      propostaPendente: { id: "prop1" },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/proposta de placar aguardando aprovação/i)
    // Consultou a proposta pendente da PARTIDA certa e SÓ as pendentes.
    expect(client.from).toHaveBeenCalledWith("match_score_proposals")
    expect(client.proposalEqSpy).toHaveBeenCalledWith("match_id", UUID)
    expect(client.proposalEqSpy).toHaveBeenCalledWith("status", "pendente")
    // Barreira: nenhuma RPC de escrita.
    expect(client.placarRpcSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("competitivo: SEM proposta pendente, o árbitro segue gravando direto", async () => {
    // Mesmo caminho não-avulso, mas propostaPendente:null → a guarda não barra.
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
      propostaPendente: null,
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    // A guarda consultou a tabela (caminho não-avulso), mas nada pendente → gravou.
    expect(client.proposalEqSpy).toHaveBeenCalledWith("match_id", UUID)
    expect(client.placarRpcSpy).toHaveBeenCalledWith(
      expect.objectContaining({ p_placar_1: 3, p_placar_2: 1 })
    )
  })

  it("avulso: a guarda de proposta NEM é consultada (evita hop no caminho comum)", async () => {
    // Participante do avulso grava direto; propostas não existem no avulso, então
    // a action não deve nem tocar match_score_proposals.
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(true)
    expect(client.from).not.toHaveBeenCalledWith("match_score_proposals")
    expect(client.proposalEqSpy).not.toHaveBeenCalled()
  })

  it("mapeia PARTIDA_INDISPONIVEL da RPC (guarda otimista / corrida)", async () => {
    montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      rpcError: { message: 'erro: PARTIDA_INDISPONIVEL' },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("alterada")
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("mapeia PARTIDA_ENCERRADA da RPC (encerrou entre a checagem e a escrita)", async () => {
    montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      rpcError: { message: 'PARTIDA_ENCERRADA' },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/encerrada/i)
  })

  it("mapeia NAO_AUTORIZADO da RPC (POST direto que burlou a UI)", async () => {
    montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      rpcError: { message: 'NAO_AUTORIZADO' },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Você não participa desta partida.")
  })

  it("erro genérico da RPC vira mensagem de salvar o placar (sem vazar interno)", async () => {
    montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      rpcError: { message: "deadlock detected" },
    })
    const r = await updateMatchScore(entradaValida)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Não foi possível salvar o placar.")
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})
