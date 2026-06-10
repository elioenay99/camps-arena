import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { ImageResponse } from "next/og"

/**
 * Card OG/Twitter ESTÁTICO da marca Arena (1200×630), gerado por `next/og`
 * (Satori). É a fonte ÚNICA dos `opengraph-image`/`twitter-image` da raiz —
 * herdado por TODAS as rotas, então qualquer link compartilhado (landing,
 * login, convite) ganha o mesmo preview da marca.
 *
 * Por que só estático: as rotas de torneio são auth-gated (crawler é
 * redirecionado ao login) e as RPCs de convite negam `anon` — um crawler social
 * (sempre anônimo) jamais leria o título do torneio. Um OG dinâmico cairia
 * sempre no fallback, sem benefício de preview. O card da marca, ao contrário,
 * funciona em todo preview e não vaza nome de torneio.
 *
 * Satori suporta só flexbox + subset de CSS (sem grid; cores em hex, não oklch).
 */

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_ALT = "Arena — torneios de clubes com placar ao vivo"
export const OG_CONTENT_TYPE = "image/png"

// Identidade "estádio à noite": verde-gramado sobre fundo quase-preto.
const VERDE = "#34e58b"
const FUNDO = "#0a120e"
const TEXTO = "#e8f0ec"
const TEXTO_SUAVE = "#9fb3aa"

const FONTS_DIR = join(process.cwd(), "src/features/og/fonts")
const LOGO_PATH = join(process.cwd(), "src/app/icon.svg")

/** Buffer → ArrayBuffer exato (cópia) — o tipo de `fonts[].data` exige ArrayBuffer. */
function paraArrayBuffer(buf: Buffer): ArrayBuffer {
  return new Uint8Array(buf).buffer
}

async function carregarAssets() {
  const [medium, bold, logoSvg] = await Promise.all([
    readFile(join(FONTS_DIR, "SpaceGrotesk-500.woff")),
    readFile(join(FONTS_DIR, "SpaceGrotesk-700.woff")),
    readFile(LOGO_PATH, "utf8"),
  ])
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`
  return { medium, bold, logoSrc }
}

function BrandCard({ logoSrc }: { logoSrc: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: FUNDO,
        backgroundImage: `radial-gradient(circle at 50% 34%, #16241d 0%, ${FUNDO} 62%)`,
        fontFamily: "Space Grotesk",
        color: TEXTO,
        padding: "80px",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} width={156} height={156} alt="" style={{ marginBottom: 44 }} />
      <div
        style={{
          display: "flex",
          fontSize: 108,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: VERDE,
          lineHeight: 1,
        }}
      >
        Arena
      </div>
      <div
        style={{
          display: "flex",
          width: 132,
          height: 6,
          backgroundColor: VERDE,
          borderRadius: 9999,
          margin: "38px 0",
        }}
      />
      <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: TEXTO_SUAVE }}>
        Torneios de clubes · placar ao vivo
      </div>
    </div>
  )
}

/** Gera o card da marca como PNG. Usado pelos `opengraph-image`/`twitter-image`. */
export async function renderBrandOg(): Promise<ImageResponse> {
  const { medium, bold, logoSrc } = await carregarAssets()
  return new ImageResponse(<BrandCard logoSrc={logoSrc} />, {
    ...OG_SIZE,
    fonts: [
      { name: "Space Grotesk", data: paraArrayBuffer(medium), weight: 500, style: "normal" },
      { name: "Space Grotesk", data: paraArrayBuffer(bold), weight: 700, style: "normal" },
    ],
  })
}
