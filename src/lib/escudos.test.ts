import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { rehospedarEscudo } from "@/lib/escudos"

const ORIGEM = "https://media.api-sports.io/football/teams/33.png"
const PUBLICA = "https://ref.supabase.co/storage/v1/object/public/escudos/33.png"

interface CenarioStorage {
  uploadError?: unknown
}

function montarClient(c: CenarioStorage = {}) {
  const upload = vi.fn().mockResolvedValue({
    data: c.uploadError ? null : { path: "33.png" },
    error: c.uploadError ?? null,
  })
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: PUBLICA } })
  const from = vi.fn(() => ({ upload, getPublicUrl }))
  const client = { storage: { from } }
  return { client: client as unknown as never, upload, getPublicUrl, from }
}

/**
 * Resposta `fetch` mínima com content-type de imagem e bytes controlados.
 * `ok`/`contentLength` configuráveis para exercitar os guards independentemente.
 */
function respostaFake({
  ok = true,
  bytes = 1024,
  contentType = "image/png" as string | null,
  contentLength = null as number | null,
} = {}) {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: {
      get: (k: string) => {
        const key = k.toLowerCase()
        if (key === "content-type") return contentType
        if (key === "content-length") return contentLength === null ? null : String(contentLength)
        return null
      },
    },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  }
}

/** Caminho feliz padrão (200 + imagem + bytes válidos). */
function respostaOk(bytes = 1024, contentType: string | null = "image/png") {
  return respostaFake({ bytes, contentType })
}

describe("rehospedarEscudo", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("baixa a origem e sobe no bucket, devolvendo a URL pública do Storage", async () => {
    mockFetch.mockResolvedValue(respostaOk())
    const { client, upload, from, getPublicUrl } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(PUBLICA)
    expect(mockFetch).toHaveBeenCalledWith(ORIGEM, expect.objectContaining({ signal: expect.anything() }))
    expect(from).toHaveBeenCalledWith("escudos")
    // Chave determinística por external_id + upsert (idempotente).
    const [caminho, , opts] = upload.mock.calls[0]
    expect(caminho).toBe("33.png")
    expect(opts).toMatchObject({ contentType: "image/png", upsert: true })
    expect(getPublicUrl).toHaveBeenCalledWith("33.png")
  })

  it("fallback para a origem quando o download não é ok (guard !resposta.ok)", async () => {
    // Resposta non-ok MAS com headers+bytes válidos: sem o guard `if(!res.ok)`
    // o fluxo seguiria pro upload — assim o teste DISCRIMINA o guard (não cai no
    // catch por falta de arrayBuffer/headers).
    mockFetch.mockResolvedValue(respostaFake({ ok: false }))
    const { client, upload } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(upload).not.toHaveBeenCalled()
  })

  it("fallback pelo Content-Length declarado maior que o teto (antes do buffer)", async () => {
    // arrayBuffer traria bytes pequenos (válidos); só o Content-Length grande
    // dispara o pré-check — discrimina o guard de Content-Length isoladamente.
    mockFetch.mockResolvedValue(respostaFake({ bytes: 512, contentLength: 256 * 1024 + 1 }))
    const { client, upload } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(upload).not.toHaveBeenCalled()
  })

  it("fallback para a origem quando o download lança (rede/timeout)", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"))
    const { client, upload } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(upload).not.toHaveBeenCalled()
  })

  it("fallback quando a resposta não é imagem (defensivo)", async () => {
    mockFetch.mockResolvedValue(respostaOk(1024, "text/html"))
    const { client, upload } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(upload).not.toHaveBeenCalled()
  })

  it("fallback quando o payload excede o limite do bucket (256KB)", async () => {
    mockFetch.mockResolvedValue(respostaOk(256 * 1024 + 1))
    const { client, upload } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(upload).not.toHaveBeenCalled()
  })

  it("fallback quando a resposta vem vazia", async () => {
    mockFetch.mockResolvedValue(respostaOk(0))
    const { client, upload } = montarClient()

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(upload).not.toHaveBeenCalled()
  })

  it("fallback para a origem quando o upload falha (non-fatal)", async () => {
    mockFetch.mockResolvedValue(respostaOk())
    const { client, getPublicUrl } = montarClient({ uploadError: { message: "storage down" } })

    const url = await rehospedarEscudo(client, "33", ORIGEM)

    expect(url).toBe(ORIGEM)
    expect(getPublicUrl).not.toHaveBeenCalled()
  })
})
