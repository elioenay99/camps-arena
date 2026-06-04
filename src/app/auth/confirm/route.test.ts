import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { GET } from "@/app/auth/confirm/route"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

function montarClient(opts: { verifyError?: boolean; exchangeError?: boolean } = {}) {
  const verifySpy = vi.fn(async () => ({
    error: opts.verifyError ? { message: "expired", code: "otp_expired" } : null,
  }))
  const exchangeSpy = vi.fn(async () => ({
    error: opts.exchangeError ? { message: "bad code" } : null,
  }))
  mockCreateClient.mockResolvedValue({
    auth: { verifyOtp: verifySpy, exchangeCodeForSession: exchangeSpy },
  } as unknown as never)
  return { verifySpy, exchangeSpy }
}

function req(query: string) {
  return new NextRequest(`http://localhost:3000/auth/confirm${query}`)
}

function location(res: Response) {
  return new URL(res.headers.get("location") ?? "")
}

beforeEach(() => vi.clearAllMocks())

describe("GET /auth/confirm", () => {
  it("token_hash válido cria sessão (verifyOtp) e redireciona ao next interno", async () => {
    const { verifySpy } = montarClient()
    const res = await GET(req("?token_hash=abc&type=recovery&next=/atualizar-senha"))

    expect(verifySpy).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" })
    const destino = location(res)
    expect(destino.pathname).toBe("/atualizar-senha")
    // Sessão NÃO viaja na URL.
    expect(destino.search).toBe("")
  })

  it("next externo é neutralizado para o destino padrão (anti open-redirect)", async () => {
    montarClient()
    const res = await GET(req("?token_hash=abc&type=email&next=https://evil.example"))
    const destino = location(res)
    expect(destino.hostname).toBe("localhost")
    expect(destino.pathname).toBe("/dashboard")
  })

  it("next protocol-relative (//) é neutralizado", async () => {
    montarClient()
    const res = await GET(req("?token_hash=abc&type=email&next=//evil.example"))
    const destino = location(res)
    expect(destino.hostname).toBe("localhost")
    expect(destino.pathname).toBe("/dashboard")
  })

  it("fallback: code (template default) troca via exchangeCodeForSession", async () => {
    const { exchangeSpy, verifySpy } = montarClient()
    const res = await GET(req("?code=xyz&next=/dashboard"))

    expect(exchangeSpy).toHaveBeenCalledWith("xyz")
    expect(verifySpy).not.toHaveBeenCalled()
    expect(location(res).pathname).toBe("/dashboard")
  })

  it("token inválido/expirado volta ao login com aviso", async () => {
    montarClient({ verifyError: true })
    const res = await GET(req("?token_hash=abc&type=recovery&next=/atualizar-senha"))
    const destino = location(res)
    expect(destino.pathname).toBe("/login")
    expect(destino.searchParams.get("aviso")).toBe("link-invalido")
  })

  it("code inválido (fallback) volta ao login com aviso", async () => {
    montarClient({ exchangeError: true })
    const res = await GET(req("?code=ruim&next=/dashboard"))
    const destino = location(res)
    expect(destino.pathname).toBe("/login")
    expect(destino.searchParams.get("aviso")).toBe("link-invalido")
  })

  it("type sem token_hash não chama verifyOtp — volta ao login", async () => {
    const { verifySpy } = montarClient()
    const res = await GET(req("?type=recovery&next=/atualizar-senha"))
    expect(verifySpy).not.toHaveBeenCalled()
    expect(location(res).pathname).toBe("/login")
  })

  it("token_hash sem type não chama verifyOtp — volta ao login", async () => {
    const { verifySpy } = montarClient()
    const res = await GET(req("?token_hash=abc"))
    expect(verifySpy).not.toHaveBeenCalled()
    expect(location(res).pathname).toBe("/login")
  })

  it("type fora da allowlist é rejeitado sem chamar verifyOtp (defesa em profundidade)", async () => {
    const { verifySpy } = montarClient()
    const res = await GET(req("?token_hash=abc&type=magiclink&next=/dashboard"))
    expect(verifySpy).not.toHaveBeenCalled()
    expect(location(res).pathname).toBe("/login")
  })

  it("sem token nem code volta ao login com aviso, sem tocar o Supabase", async () => {
    montarClient()
    const res = await GET(req(""))
    expect(mockCreateClient).not.toHaveBeenCalled()
    expect(location(res).pathname).toBe("/login")
  })
})
