import { describe, expect, it, vi } from "vitest"

// `next/font/google` só existe sob o compilador do Next (avalia no build); em
// teste vira stub para conseguirmos importar o layout e ler os exports de config.
vi.mock("next/font/google", () => {
  const fonte = () => ({ variable: "--fonte-de-teste" })
  return { Geist: fonte, Geist_Mono: fonte, Space_Grotesk: fonte }
})

describe("configuração de viewport do shell", () => {
  it("declara viewportFit cover — sem ele todo env(safe-area-inset-*) vale 0", async () => {
    const { viewport } = await import("./layout")
    expect(viewport.viewportFit).toBe("cover")
  })

  it("mantém o statusBarStyle que TORNA o cover obrigatório", async () => {
    // As duas declarações são um par: `black-translucent` joga o conteúdo por
    // baixo da status bar e só o `cover` habilita a compensação por safe-area.
    // Se alguém remover uma, este teste força a revisão da outra.
    const { metadata } = await import("./layout")
    expect(metadata.appleWebApp).toMatchObject({
      statusBarStyle: "black-translucent",
    })
  })
})
