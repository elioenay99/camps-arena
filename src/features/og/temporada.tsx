import { ImageResponse } from "next/og"

import { env } from "@/lib/env"

import { carregarAssets, paraArrayBuffer } from "./brand"

/**
 * Pôster "Temporada encerrada" (change add-conquistas-hall) — PNG 1080×1350
 * gerado por `next/og` (Satori) para o dono compartilhar. Reusa as fontes/logo do
 * OG da marca (`carregarAssets`) e a linguagem visual do card de rodada: campeão
 * da elite em destaque + colunas de quem subiu / quem caiu. Escudos remotos entram
 * como data URL (host ancorado na allowlist, anti-SSRF); ausência cai em monograma.
 */

const WIDTH = 1080
const HEIGHT = 1350

// Tema Dracula (a liga não tem cor própria no pôster de temporada).
const FUNDO = "#282a36"
const FUNDO_CARD = "#343746"
const ROXO = "#bd93f9"
const VERDE = "#50fa7b"
const VERMELHO = "#ff5555"
const OURO = "#f1c40f"
const TEXTO = "#f8f8f2"
const TEXTO_SUAVE = "#abafd0"

/** Máximo de clubes listados por coluna (subiram/caíram); o resto vira "+N". */
const MAX_COLUNA = 6

export interface ClubeOg {
  nome: string
  escudoUrl: string | null
}

export interface DadosTemporadaOg {
  titulo: string
  campeao: ClubeOg | null
  subiram: ClubeOg[]
  cairam: ClubeOg[]
}

/** Cor estável (HSL) para o monograma — replica TeamCrest (que é client). */
function corDoNome(nome: string): string {
  let h = 0
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 45% 32%)`
}

function inicial(nome: string): string {
  return [...nome.trim()][0]?.toUpperCase() ?? "?"
}

function cortar(nome: string, max = 20): string {
  const chars = [...nome]
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : nome
}

/**
 * Hosts confiáveis do escudo, para o fetch server-side (anti-SSRF). Espelha o
 * `csp.ts`/`next.config.ts` e a rota de rodada: CDN da api-sports (transição) +
 * host EXATO do Storage do projeto (derivado do env). `escudo_url` vem do banco,
 * mas a RLS de `teams` não valida a URL — sem esta allowlist, um dono poderia
 * gravar uma URL interna e disparar SSRF cego. Host fora da lista ⇒ monograma.
 */
const ESCUDO_HOSTS_CONFIAVEIS = new Set<string>([
  "media.api-sports.io",
  new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
])

/** Escudo remoto → data URL (timeout 2s, paralelizável). Falha ⇒ null (monograma). */
async function escudoDataURL(url: string): Promise<string | null> {
  try {
    if (!ESCUDO_HOSTS_CONFIAVEIS.has(new URL(url).host)) return null
  } catch {
    return null
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get("content-type") ?? "image/png"
    return `data:${mime};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

function Crest({
  nome,
  escudoData,
  lado,
}: {
  nome: string
  escudoData: string | null
  lado: number
}) {
  if (escudoData) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={escudoData} width={lado} height={lado} alt="" style={{ borderRadius: 12 }} />
    )
  }
  return (
    <div
      style={{
        display: "flex",
        width: lado,
        height: lado,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: corDoNome(nome),
        color: "#ffffff",
        fontSize: Math.round(lado * 0.48),
        fontWeight: 700,
      }}
    >
      {inicial(nome)}
    </div>
  )
}

function Coluna({
  titulo,
  cor,
  clubes,
  escudos,
  restantes,
}: {
  titulo: string
  cor: string
  clubes: ClubeOg[]
  escudos: (string | null)[]
  restantes: number
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 452 }}>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: cor, letterSpacing: "0.04em" }}>
        {titulo}
      </div>
      {clubes.length === 0 ? (
        <div style={{ display: "flex", fontSize: 26, color: TEXTO_SUAVE }}>—</div>
      ) : (
        clubes.map((c, i) => (
          <div key={`${c.nome}-${i}`} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Crest nome={c.nome} escudoData={escudos[i] ?? null} lado={56} />
            <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: TEXTO }}>
              {cortar(c.nome, 16)}
            </div>
          </div>
        ))
      )}
      {restantes > 0 ? (
        <div style={{ display: "flex", fontSize: 24, color: TEXTO_SUAVE }}>
          +{restantes} clube{restantes === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  )
}

/** Gera o PNG do pôster "Temporada encerrada". */
export async function renderTemporadaOg({
  titulo,
  campeao,
  subiram,
  cairam,
}: DadosTemporadaOg): Promise<ImageResponse> {
  const { medium, bold, logoSrc } = await carregarAssets()

  const subVis = subiram.slice(0, MAX_COLUNA)
  const caiVis = cairam.slice(0, MAX_COLUNA)

  // Escudos em paralelo (cada um com timeout próprio): campeão + colunas.
  const [campeaoEscudo, subEscudos, caiEscudos] = await Promise.all([
    campeao?.escudoUrl ? escudoDataURL(campeao.escudoUrl) : Promise.resolve(null),
    Promise.all(subVis.map((c) => (c.escudoUrl ? escudoDataURL(c.escudoUrl) : Promise.resolve(null)))),
    Promise.all(caiVis.map((c) => (c.escudoUrl ? escudoDataURL(c.escudoUrl) : Promise.resolve(null)))),
  ])

  const t = titulo.trim() || "Temporada"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: FUNDO,
          backgroundImage: `radial-gradient(circle at 50% 0%, #3a3250 0%, ${FUNDO} 60%)`,
          fontFamily: "Space Grotesk",
          color: TEXTO,
          padding: "64px 56px",
        }}
      >
        {/* Cabeçalho: marca + rótulo */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={64} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "0.04em", color: ROXO }}>
            GOLISEU
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: TEXTO, marginTop: 28 }}>
          Temporada encerrada
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 4 }}>
          {cortar(t, 34)}
        </div>

        {/* Campeão em destaque */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            backgroundColor: FUNDO_CARD,
            border: `2px solid ${OURO}`,
            borderRadius: 24,
            padding: "36px 40px",
            marginTop: 44,
          }}
        >
          <Crest nome={campeao?.nome ?? "?"} escudoData={campeaoEscudo} lado={140} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: OURO, letterSpacing: "0.08em" }}>
              CAMPEÃO
            </div>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: TEXTO }}>
              {cortar(campeao?.nome ?? "A definir", 18)}
            </div>
          </div>
        </div>

        {/* Subiram / Caíram */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48, gap: 24 }}>
          <Coluna
            titulo="SUBIRAM"
            cor={VERDE}
            clubes={subVis}
            escudos={subEscudos}
            restantes={subiram.length - subVis.length}
          />
          <Coluna
            titulo="CAÍRAM"
            cor={VERMELHO}
            clubes={caiVis}
            escudos={caiEscudos}
            restantes={cairam.length - caiVis.length}
          />
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        { name: "Space Grotesk", data: paraArrayBuffer(medium), weight: 500, style: "normal" },
        { name: "Space Grotesk", data: paraArrayBuffer(bold), weight: 700, style: "normal" },
      ],
    }
  )
}
