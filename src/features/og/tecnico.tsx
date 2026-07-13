import { ImageResponse } from "next/og"

import type { ConquistaTemporada } from "@/features/league/data/getConquistasDoCompetidor"
import type { Campanha } from "@/features/standings/coachStats"

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
} from "./compartilhado"

/**
 * Pôster PESSOAL do técnico (change add-frente-compartilhavel) — PNG 1080×1350
 * gerado por `next/og` (Satori). Foto/avatar + nome + campanha de sempre
 * (J/V/E/D + aproveitamento) + troféus herdados (contagem por tipo). Reusa
 * fontes/logo/allowlist compartilhados (a foto entra pela mesma allowlist do
 * Storage). Sem cor de campeonato: identidade roxa da marca.
 */

const WIDTH = 1080
const HEIGHT = 1350
export const TECNICO_CONTENT_TYPE = "image/png"

/** Contagem de troféus por tipo, na ordem de nobreza, para o pôster. */
const TROFEU_LABEL: { tipo: string; label: string }[] = [
  { tipo: "campeao", label: "Títulos" },
  { tipo: "vice", label: "Vices" },
  { tipo: "promovido", label: "Acessos" },
  { tipo: "artilheiro", label: "Artilharias" },
]

interface TrofeuResumo {
  label: string
  total: number
}

/** Agrega os troféus por tipo (só os tipos exibidos), preservando a ordem. Pura. */
export function resumirTrofeus(conquistas: ConquistaTemporada[]): TrofeuResumo[] {
  const contagem = new Map<string, number>()
  for (const c of conquistas) {
    for (const t of c.trofeus) {
      contagem.set(t.tipo, (contagem.get(t.tipo) ?? 0) + 1)
    }
  }
  return TROFEU_LABEL.map(({ tipo, label }) => ({
    label,
    total: contagem.get(tipo) ?? 0,
  })).filter((r) => r.total > 0)
}

function StatTile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: FUNDO_CARD,
        borderRadius: 20,
        padding: "28px 0",
        flex: 1,
        gap: 8,
      }}
    >
      <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: TEXTO, lineHeight: 1 }}>
        {valor}
      </div>
      <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: TEXTO_SUAVE, letterSpacing: "0.04em" }}>
        {rotulo}
      </div>
    </div>
  )
}

interface DadosTecnico {
  nome: string
  avatarUrl: string | null
  campanha: Campanha
  conquistas: ConquistaTemporada[]
}

/** Gera o PNG do pôster do técnico. */
export async function renderTecnicoOg({
  nome,
  avatarUrl,
  campanha,
  conquistas,
}: DadosTecnico): Promise<ImageResponse> {
  const { medium, bold, logoSrc } = await carregarAssets()

  const avatarData = avatarUrl ? await escudoDataURL(avatarUrl) : null
  const trofeus = resumirTrofeus(conquistas)
  const n = nome.trim() || "Técnico"

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
        {/* Cabeçalho: marca */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={64} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: "0.04em", color: ROXO }}>
            GOLISEU
          </div>
        </div>

        {/* Identidade: foto + nome */}
        <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 52 }}>
          <Crest nome={n} escudoData={avatarData} lado={200} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: ROXO, letterSpacing: "0.1em" }}>
              TÉCNICO
            </div>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, color: TEXTO, lineHeight: 1.05 }}>
              {cortar(n, 18)}
            </div>
          </div>
        </div>

        {/* Campanha de sempre */}
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: TEXTO_SUAVE, letterSpacing: "0.08em", marginTop: 56 }}>
          CAMPANHA DE SEMPRE
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
          <StatTile rotulo="Jogos" valor={String(campanha.jogos)} />
          <StatTile rotulo="Vitórias" valor={String(campanha.vitorias)} />
          <StatTile rotulo="Empates" valor={String(campanha.empates)} />
          <StatTile rotulo="Derrotas" valor={String(campanha.derrotas)} />
        </div>
        <div style={{ display: "flex", marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: FUNDO_CARD,
              borderRadius: 20,
              padding: "24px 36px",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: TEXTO_SUAVE }}>
              Aproveitamento
            </div>
            <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: ROXO }}>
              {`${campanha.aproveitamento}%`}
            </div>
          </div>
        </div>

        {/* Troféus */}
        {trofeus.length > 0 ? (
          <>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: TEXTO_SUAVE, letterSpacing: "0.08em", marginTop: 44 }}>
              TROFÉUS
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
              {trofeus.map((t) => (
                <div
                  key={t.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    backgroundColor: FUNDO_CARD,
                    border: `2px solid ${OURO}`,
                    borderRadius: 9999,
                    padding: "14px 28px",
                  }}
                >
                  <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: OURO }}>
                    {t.total}
                  </div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: TEXTO }}>
                    {t.label}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: TEXTO_SUAVE, marginTop: "auto" }}>
          Carreira no Goliseu
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
