import { ImageResponse } from "next/og"

import type { CoresResolvidas } from "@/features/standings/data/getTournamentClassificacao"
import type { PartidaParaImagem } from "@/features/match/data/getPartidaParaImagem"

import { carregarAssets, paraArrayBuffer } from "./brand"
import {
  cortar,
  Crest,
  escudoDataURL,
  FUNDO,
  HEX6,
  OURO,
  ROXO,
  TEXTO,
  TEXTO_SUAVE,
  VERMELHO,
} from "./compartilhado"

/**
 * Card de RESULTADO de uma partida encerrada (change add-frente-compartilhavel) —
 * PNG 1080×1080 gerado por `next/og` (Satori). Placar em destaque + os dois lados
 * (escudo no competitivo; foto/monograma no avulso) + selo derivado. Altura FIXA
 * (uma partida não cresce). Tematizado por `resolverCoresTorneio`. Reusa os
 * helpers compartilhados (fonte/logo/allowlist anti-SSRF).
 */

const WIDTH = 1080
const HEIGHT = 1080
export const PARTIDA_CONTENT_TYPE = "image/png"

/** Selo derivado do modelo (sem coluna nova). */
export type SeloResultado = "GOLEADA" | "W.O." | "W.O. DUPLO" | null

/**
 * Selo PURO do resultado (testável sem renderizar): **W.O. DUPLO** quando
 * `woDuplo`; **W.O.** quando `wo && !woDuplo`; **GOLEADA** quando `!wo` e a
 * diferença de gols é ≥ 3; senão nenhum.
 */
export function seloDoResultado(p: {
  wo?: boolean
  woDuplo?: boolean
  placar_1: number
  placar_2: number
}): SeloResultado {
  if (p.woDuplo) return "W.O. DUPLO"
  if (p.wo) return "W.O."
  if (Math.abs(p.placar_1 - p.placar_2) >= 3) return "GOLEADA"
  return null
}

/** Projeção de UM lado para o card (competitivo × avulso), PURA. A imagem é o
 * escudo do clube (competitivo) OU a foto do participante (avulso); null cai no
 * monograma no renderer. */
export interface LadoImagemPartida {
  nome: string
  imagemUrl: string | null
}

export function projetarLadoPartida(
  p: PartidaParaImagem,
  lado: 1 | 2
): LadoImagemPartida {
  return lado === 1
    ? { nome: p.nome_1, imagemUrl: p.escudo_1 ?? p.avatarUrl_1 ?? null }
    : { nome: p.nome_2, imagemUrl: p.escudo_2 ?? p.avatarUrl_2 ?? null }
}

/** Lado vencedor (1|2|null) para o realce cromático: no W.O. simples é o
 * `woVencedorLado`; sem W.O. é quem tem o placar maior; W.O. duplo não tem. */
function ladoVencedor(p: PartidaParaImagem): 1 | 2 | null {
  if (p.woDuplo) return null
  if (p.wo) return p.woVencedorLado ?? null
  if (p.placar_1 > p.placar_2) return 1
  if (p.placar_2 > p.placar_1) return 2
  return null
}

/** Cor de fundo do selo por tipo. */
function corDoSelo(selo: SeloResultado, accent: string): string {
  if (selo === "GOLEADA") return OURO
  if (selo === "W.O. DUPLO") return VERMELHO
  return accent
}

function LadoCard({
  nome,
  imagemData,
  vencedor,
  accent,
}: {
  nome: string
  imagemData: string | null
  vencedor: boolean
  accent: string
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        width: 340,
      }}
    >
      <Crest nome={nome} escudoData={imagemData} lado={200} />
      <div
        style={{
          display: "flex",
          fontSize: 44,
          fontWeight: 700,
          color: vencedor ? accent : TEXTO,
          textAlign: "center",
        }}
      >
        {cortar(nome, 16)}
      </div>
    </div>
  )
}

interface DadosPartida {
  partida: PartidaParaImagem
  titulo?: string | null
  cores: CoresResolvidas
}

/** Gera o PNG do resultado da partida. */
export async function renderPartidaOg({
  partida,
  titulo,
  cores,
}: DadosPartida): Promise<ImageResponse> {
  const { medium, bold, logoSrc } = await carregarAssets()
  const accent = cores.primaria && HEX6.test(cores.primaria) ? cores.primaria : ROXO

  const lado1 = projetarLadoPartida(partida, 1)
  const lado2 = projetarLadoPartida(partida, 2)
  const [img1, img2] = await Promise.all([
    lado1.imagemUrl ? escudoDataURL(lado1.imagemUrl) : Promise.resolve(null),
    lado2.imagemUrl ? escudoDataURL(lado2.imagemUrl) : Promise.resolve(null),
  ])

  const selo = seloDoResultado(partida)
  const venc = ladoVencedor(partida)
  const t = titulo?.trim() || "Campeonato"
  // No W.O. o placar 0×0 não representa o jogo — mostramos "W.O." no lugar dos números.
  const mostraPlacar = !partida.wo

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
        {/* Cabeçalho: marca + título */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={64} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "0.04em", color: accent }}>
            GOLISEU
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 24 }}>
          {cortar(t, 34)}
        </div>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: accent, letterSpacing: "0.1em", marginTop: 6 }}>
          RESULTADO
        </div>

        {/* Confronto: lado × placar × lado, centralizado no miolo */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
          }}
        >
          <LadoCard nome={lado1.nome} imagemData={img1} vencedor={venc === 1} accent={accent} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 280, gap: 12 }}>
            {mostraPlacar ? (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", fontSize: 132, fontWeight: 700, color: venc === 1 ? accent : TEXTO, lineHeight: 1 }}>
                  {partida.placar_1}
                </div>
                <div style={{ display: "flex", fontSize: 64, fontWeight: 500, color: TEXTO_SUAVE, lineHeight: 1 }}>×</div>
                <div style={{ display: "flex", fontSize: 132, fontWeight: 700, color: venc === 2 ? accent : TEXTO, lineHeight: 1 }}>
                  {partida.placar_2}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 72, fontWeight: 700, color: TEXTO, lineHeight: 1 }}>×</div>
            )}
            {selo ? (
              <div
                style={{
                  display: "flex",
                  backgroundColor: corDoSelo(selo, accent),
                  color: "#1a1b26",
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  padding: "8px 22px",
                  borderRadius: 9999,
                }}
              >
                {selo}
              </div>
            ) : null}
          </div>
          <LadoCard nome={lado2.nome} imagemData={img2} vencedor={venc === 2} accent={accent} />
        </div>

        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: TEXTO_SUAVE }}>
          Acompanhe no Goliseu
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
