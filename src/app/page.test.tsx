// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Landing pública (add-landing-conversao): material de aquisição, renderiza só
// deslogado (sessão → redirect para /dashboard). Auth do Supabase e o redirect
// são mockados; as seções da narrativa renderizam de verdade.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import Home from "@/app/page"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

function auth(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as Awaited<ReturnType<typeof createClient>>)
}

async function renderPage() {
  return render(await Home())
}

beforeEach(() => {
  mockCreateClient.mockReset()
})
afterEach(cleanup)

describe("Home (landing de conversão)", () => {
  it("logado: redireciona para o dashboard", async () => {
    auth({ id: "u1" })
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard")
  })

  it("deslogado: hook lidera com a profundidade, 'sem planilha' secundário", async () => {
    auth(null)
    await renderPage()

    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveTextContent(/Monte a sua/i)
    expect(h1).toHaveTextContent(/liga nacional/i)
    // "sem planilha" existe, mas fora do herói (no subtítulo de apoio).
    expect(screen.getByText(/sem planilha/i)).toBeInTheDocument()
  })

  it("deslogado: exibe a narrativa completa sem login", async () => {
    auth(null)
    await renderPage()

    // Profundidade (ensina os termos de nicho)
    expect(
      screen.getByRole("heading", { name: /Não é um bolão\. É uma liga\./i })
    ).toBeInTheDocument()
    // Telas anotadas + callout de ensino
    expect(
      screen.getByRole("heading", { name: /Veja por dentro/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/últimos 5 resultados/i)).toBeInTheDocument()
    // Como funciona
    expect(
      screen.getByRole("heading", { name: /Como funciona/i })
    ).toBeInTheDocument()
    // CTA de conversão para o fluxo existente (hero + fechamento apontam a /cadastro)
    const ctas = screen.getAllByRole("link", { name: /Criar conta grátis/i })
    expect(ctas.length).toBeGreaterThanOrEqual(1)
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/cadastro")
  })

  it("deslogado: prova social deixa VISÍVEL a natureza ilustrativa", async () => {
    auth(null)
    await renderPage()
    // Disclosure honesto (não só comentário no código).
    expect(screen.getByText(/Exemplos ilustrativos/i)).toBeInTheDocument()
    expect(screen.getByText(/não são clientes reais/i)).toBeInTheDocument()
    // Selo "Exemplo" por card (3 depoimentos).
    expect(screen.getAllByText(/^Exemplo$/i)).toHaveLength(3)
  })

  it("deslogado: FAQ usa <details>/<summary> com as perguntas-chave e respostas no DOM", async () => {
    auth(null)
    await renderPage()

    for (const pergunta of [
      /É grátis\?/i,
      /Preciso instalar\?/i,
      /Serve para FIFA e eFootball\?/i,
    ]) {
      const summary = screen.getByText(pergunta)
      // Semântica: cada pergunta é um <summary> dentro de um <details> (jsdom NÃO
      // implementa o toggle por clique, então não testamos abre/fecha).
      expect(summary.tagName).toBe("SUMMARY")
      expect(summary.closest("details")).not.toBeNull()
    }

    // As respostas renderizam no DOM independentemente do estado `open`.
    expect(screen.getByText(/roda direto no navegador/i)).toBeInTheDocument()
    expect(screen.getByText(/o placar é lançado manualmente/i)).toBeInTheDocument()
  })
})
