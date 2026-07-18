import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Espia o refresh de sessão do Supabase sem tocar a rede. Em `/demo` o proxy
// deve PULAR essa chamada (vitrine 100% em memória); nas demais rotas deve
// continuar chamando-a. O mock devolve uma resposta com CSP igual à do caminho
// real, para que o teste distinga bypass por CHAMADA, não por header.
const updateSession =
  vi.fn<
    (request: NextRequest, extra?: Record<string, string>) => Promise<NextResponse>
  >(async () => NextResponse.next())
vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: (request: NextRequest, extra?: Record<string, string>) =>
    updateSession(request, extra),
}))

// Import dinâmico depois do mock estar registrado.
const { proxy } = await import("@/proxy")

function reqEm(pathname: string) {
  return new NextRequest(new URL(`http://localhost${pathname}`))
}

beforeEach(() => {
  updateSession.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("proxy() runtime — bypass de sessão em /demo", () => {
  it.each(["/demo", "/demo/torneios", "/demo/ligas"])(
    "%s NÃO chama updateSession mas recebe CSP",
    async (pathname) => {
      const response = await proxy(reqEm(pathname))

      expect(updateSession).not.toHaveBeenCalled()
      const csp = response.headers.get("content-security-policy")
      expect(csp).toBeTruthy()
      // O nonce entra no request interno via header CSP + x-nonce (mesmo bloco).
      expect(csp).toContain("nonce-")
      // O x-nonce PRECISA chegar aos request headers INTERNOS (expostos como
      // x-middleware-request-x-nonce), pois o root layout — herdado por /demo —
      // lê headers().get("x-nonce") para nonce-ar o <script> anti-flash. A CSP
      // usa strict-dynamic sem unsafe-inline, então sem esse nonce interno o
      // script seria bloqueado. Casar com o nonce da CSP prova simetria e torna
      // a asserção load-bearing (falha se o headers.set("x-nonce") sumir do ramo).
      const nonceInterno = response.headers.get("x-middleware-request-x-nonce")
      const nonceDaCsp = csp?.match(/nonce-([^']+)/)?.[1]
      expect(nonceInterno).toBeTruthy()
      expect(nonceInterno).toBe(nonceDaCsp)
    }
  )

  it.each(["/dashboard", "/atualizar-senha"])(
    "%s continua chamando updateSession",
    async (pathname) => {
      const response = await proxy(reqEm(pathname))

      expect(updateSession).toHaveBeenCalledTimes(1)
      // O nonce/CSP passam para updateSession nos request headers internos.
      const [, extra] = updateSession.mock.calls[0]
      expect(extra?.["x-nonce"]).toBeTruthy()
      expect(extra?.["content-security-policy"]).toContain("nonce-")
      expect(response.headers.get("content-security-policy")).toBeTruthy()
    }
  )

  it.each(["/demonstration", "/demo-extra"])(
    "%s (só compartilha prefixo) NÃO recebe o bypass",
    async (pathname) => {
      await proxy(reqEm(pathname))

      expect(updateSession).toHaveBeenCalledTimes(1)
    }
  )
})
