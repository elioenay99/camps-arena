import { ImageResponse } from "next/og"

import type { ConfrontoRodada } from "@/features/match/data/getPartidasDaRodada"
import type { CoresResolvidas } from "@/features/standings/data/getTournamentClassificacao"

import { carregarAssets, paraArrayBuffer } from "./brand"

/**
 * Imagem da rodada (change add-compartilhar-rodada) — PNG 1080×1080 gerado por
 * `next/og` (Satori) para o dono compartilhar no WhatsApp. Reusa as fontes/logo
 * do OG da marca (`carregarAssets`). Satori = flexbox + hex (sem grid/oklch);
 * escudos remotos entram como data URL (buscados com timeout); por-nome/ausência
 * cai em monograma. Tematizada pelas cores do campeonato (fallback Dracula).
 */

const SIZE = { width: 1080, height: 1080 } as const
export const RODADA_CONTENT_TYPE = "image/png"

// Tema base (Dracula) quando o campeonato não tem cor própria.
const FUNDO = "#282a36"
const FUNDO_CARD = "#343746"
const ROXO = "#bd93f9"
const TEXTO = "#f8f8f2"
const TEXTO_SUAVE = "#abafd0"

const HEX6 = /^#[0-9a-fA-F]{6}$/

/** Máximo de confrontos desenhados (rodada de grupos pode ter muitos). */
const MAX_LINHAS = 12

/** Cor estável (HSL) para o monograma — replica TeamCrest (que é client). */
function corDoNome(nome: string): string {
  let h = 0
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 45% 32%)`
}

function inicial(nome: string): string {
  return [...nome.trim()][0]?.toUpperCase() ?? "?"
}

/** Corta nomes longos (por-nome livre) para não quebrar o layout em rodadas
 * grandes. Satori não trunca por CSS de forma confiável; cortamos no texto. */
function cortar(nome: string, max = 18): string {
  const chars = [...nome]
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : nome
}

/** Escudo remoto → data URL (timeout 2s, paralelizável). Falha ⇒ null (monograma). */
async function escudoDataURL(url: string): Promise<string | null> {
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

function Crest({ nome, escudoData }: { nome: string; escudoData: string | null }) {
  const lado = 92
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
        fontSize: 44,
        fontWeight: 700,
      }}
    >
      {inicial(nome)}
    </div>
  )
}

function Linha({
  nome1,
  escudo1,
  nome2,
  escudo2,
  idaEVolta,
  accent,
}: {
  nome1: string
  escudo1: string | null
  nome2: string
  escudo2: string | null
  idaEVolta: boolean
  accent: string
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: FUNDO_CARD,
        borderRadius: 18,
        padding: "18px 28px",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 18, width: 400 }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 500, color: TEXTO, textAlign: "right" }}>
          {cortar(nome1)}
        </div>
        <Crest nome={nome1} escudoData={escudo1} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 96 }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: accent }}>×</div>
        {idaEVolta ? (
          <div style={{ display: "flex", fontSize: 16, fontWeight: 500, color: TEXTO_SUAVE }}>ida e volta</div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, width: 400 }}>
        <Crest nome={nome2} escudoData={escudo2} />
        <div style={{ display: "flex", fontSize: 38, fontWeight: 500, color: TEXTO }}>{cortar(nome2)}</div>
      </div>
    </div>
  )
}

interface DadosRodada {
  titulo?: string | null
  rodada: number
  confrontos: ConfrontoRodada[]
  cores: CoresResolvidas
}

/** Gera o PNG da rodada. */
export async function renderRodadaOg({
  titulo,
  rodada,
  confrontos,
  cores,
}: DadosRodada): Promise<ImageResponse> {
  const { medium, bold, logoSrc } = await carregarAssets()
  const accent = cores.primaria && HEX6.test(cores.primaria) ? cores.primaria : ROXO

  // Escudos em paralelo (cada um com timeout próprio).
  const visiveis = confrontos.slice(0, MAX_LINHAS)
  const escudos = await Promise.all(
    visiveis.flatMap((c) => [
      c.lado1.escudoUrl ? escudoDataURL(c.lado1.escudoUrl) : Promise.resolve(null),
      c.lado2.escudoUrl ? escudoDataURL(c.lado2.escudoUrl) : Promise.resolve(null),
    ])
  )
  const restantes = confrontos.length - visiveis.length
  const t = titulo?.trim() || "Campeonato"

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
        {/* Cabeçalho: marca + título + Nª RODADA */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={64} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "0.04em", color: accent }}>
            GOLISEU
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 28 }}>
          {t}
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 700, color: TEXTO, lineHeight: 1, marginTop: 4 }}>
          {`${rodada}ª RODADA`}
        </div>
        <div style={{ display: "flex", width: 160, height: 8, backgroundColor: accent, borderRadius: 9999, margin: "28px 0 36px" }} />

        {/* Confrontos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
          {visiveis.map((c, i) => (
            <Linha
              key={i}
              nome1={c.lado1.nome}
              escudo1={escudos[i * 2]}
              nome2={c.lado2.nome}
              escudo2={escudos[i * 2 + 1]}
              idaEVolta={c.idaEVolta}
              accent={accent}
            />
          ))}
          {restantes > 0 ? (
            <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 8 }}>
              {`+${restantes} confronto${restantes > 1 ? "s" : ""}`}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 28 }}>
          Acompanhe no Goliseu
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: "Space Grotesk", data: paraArrayBuffer(medium), weight: 500, style: "normal" },
        { name: "Space Grotesk", data: paraArrayBuffer(bold), weight: 700, style: "normal" },
      ],
    }
  )
}
