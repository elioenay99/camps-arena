import { ImageResponse } from "next/og"

import { carregarAssets, paraArrayBuffer } from "./brand"
import {
  cortar,
  Crest,
  escudoDataURL,
  FUNDO,
  FUNDO_CARD,
  OURO,
  ROXO,
  TEXTO,
  TEXTO_SUAVE,
  VERDE,
  VERMELHO,
} from "./compartilhado"

/**
 * Pôster "Temporada encerrada" (change add-conquistas-hall) — PNG 1080×1350
 * gerado por `next/og` (Satori) para o dono compartilhar. Reusa as fontes/logo do
 * OG da marca (`carregarAssets`) e a linguagem visual do card de rodada: campeão
 * da elite em destaque + colunas de quem subiu / quem caiu. Escudos remotos entram
 * como data URL (host ancorado na allowlist, anti-SSRF); ausência cai em monograma.
 */

const WIDTH = 1080
const HEIGHT = 1350

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
