import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Não importa `@/features/og/brand` de propósito: ele carrega `next/og` (Satori/
// wasm) no topo, pesado e dependente de runtime fora de um teste hermético. O
// render real (Satori → PNG) é validado ao vivo (build + curl). Aqui o foco é
// barato: os assets que o card LÊ existem e estão íntegros — é o que quebra em
// produção se alguém remover a fonte/logo.
describe("OG brand — assets", () => {
  it("as fontes Space Grotesk existem e são WOFF válidas (magic 'wOFF')", async () => {
    for (const peso of [500, 700]) {
      const buf = await readFile(
        join(process.cwd(), `src/features/og/fonts/SpaceGrotesk-${peso}.woff`)
      )
      expect(buf.subarray(0, 4).toString("latin1")).toBe("wOFF")
    }
  })

  it("o logo da marca existe e é um SVG", async () => {
    const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "utf8")
    expect(svg).toContain("<svg")
  })
})
