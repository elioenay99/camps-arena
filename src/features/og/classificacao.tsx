import { ImageResponse } from "next/og"

import type { Zonas } from "@/features/league/data/getDivisionStandings"
import type {
  CoresResolvidas,
  LinhaComNome,
} from "@/features/standings/data/getTournamentClassificacao"

import { carregarAssets, paraArrayBuffer } from "./brand"
import {
  cortar,
  Crest,
  escudoDataURL,
  FUNDO,
  FUNDO_CARD,
  HEX6,
  OURO,
  ROXO,
  TEXTO,
  TEXTO_SUAVE,
  VERDE,
  VERMELHO,
} from "./compartilhado"

/**
 * Card de CLASSIFICAÇÃO (change add-frente-compartilhavel) — PNG 1080×dinâmico
 * gerado por `next/og` (Satori). Um único renderer serve o torneio de LIGA (sem
 * zonas) e a divisão de pirâmide (com faixas de acesso/rebaixamento já prontas em
 * `.zonas`, sem recomputar). Por linha: posição, escudo (ou foto `avatarUrl` no
 * avulso, ou monograma), nome, P/J/V/E/D/SG. Altura cresce com o nº de linhas
 * (piso quadrado); teto de linhas + "+N". Tematizado por `resolverCoresTorneio`.
 */

const WIDTH = 1080
export const CLASSIFICACAO_CONTENT_TYPE = "image/png"

const ALTURA_MIN = 1080
const LINHA_H = 74
const LINHA_GAP = 8
const CABECALHO_H = 340 // padding-top 64 + marca + título + rótulo + barra + header da tabela
const RODAPE_H = 128 // legenda de zonas + "Acompanhe" + padding-bottom
const RESTANTES_H = 52 // linha "+N competidores"

/** Teto de linhas desenhadas — pior caso real é uma liga de 20 clubes; acima
 * disso cai no "+N" (não corta). */
const MAX_LINHAS = 20

/** Altura do PNG a partir do nº de linhas desenhadas. Pura/determinística. */
export function alturaDaClassificacao(n: number, temRestantes: boolean): number {
  const corpo = n * LINHA_H + Math.max(0, n - 1) * LINHA_GAP
  const restantes = temRestantes ? RESTANTES_H : 0
  return Math.max(ALTURA_MIN, CABECALHO_H + corpo + restantes + RODAPE_H)
}

/** Cor da faixa de zona de uma posição (1-based); null fora de zona. Pura. */
export function corDaZona(pos: number, zonas?: Zonas): string | null {
  if (!zonas) return null
  if (zonas.acesso.includes(pos)) return VERDE
  if (zonas.rebaixamento.includes(pos)) return VERMELHO
  if (zonas.playoffAcesso.includes(pos) || zonas.playoffRebaixamento.includes(pos)) {
    return OURO
  }
  return null
}

const CELULA = 60

function Celula({ children, cor = TEXTO }: { children: React.ReactNode; cor?: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: CELULA,
        justifyContent: "center",
        fontSize: 30,
        fontWeight: 500,
        color: cor,
      }}
    >
      {children}
    </div>
  )
}

function LinhaTabela({
  linha,
  escudoData,
  accent,
  zonaCor,
}: {
  linha: LinhaComNome
  escudoData: string | null
  accent: string
  zonaCor: string | null
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: FUNDO_CARD,
        borderRadius: 14,
        padding: "10px 20px",
        gap: 16,
        borderLeft: `8px solid ${zonaCor ?? "transparent"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 48,
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 700,
          color: linha.posicao === 1 ? OURO : TEXTO_SUAVE,
        }}
      >
        {linha.posicao}
      </div>
      <Crest nome={linha.nome} escudoData={escudoData} lado={52} />
      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          fontSize: 32,
          fontWeight: 500,
          color: TEXTO,
        }}
      >
        {cortar(linha.nome, 18)}
      </div>
      <Celula cor={accent}>{linha.pontos}</Celula>
      <Celula>{linha.jogos}</Celula>
      <Celula>{linha.vitorias}</Celula>
      <Celula>{linha.empates}</Celula>
      <Celula>{linha.derrotas}</Celula>
      <Celula>{linha.saldo > 0 ? `+${linha.saldo}` : linha.saldo}</Celula>
    </div>
  )
}

function CabecalhoTabela() {
  const rotulos: [string, string][] = [
    ["P", "pontos"],
    ["J", "jogos"],
    ["V", "vitorias"],
    ["E", "empates"],
    ["D", "derrotas"],
    ["SG", "saldo"],
  ]
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 20px", gap: 16 }}>
      <div style={{ display: "flex", width: 48 }} />
      <div style={{ display: "flex", width: 52 }} />
      <div style={{ display: "flex", flex: 1, minWidth: 0 }} />
      {rotulos.map(([r, k]) => (
        <div
          key={k}
          style={{
            display: "flex",
            width: CELULA,
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: TEXTO_SUAVE,
          }}
        >
          {r}
        </div>
      ))}
    </div>
  )
}

interface DadosClassificacao {
  titulo?: string | null
  linhas: LinhaComNome[]
  zonas?: Zonas
  cores: CoresResolvidas
}

/** Gera o PNG da classificação (torneio de liga ou divisão de pirâmide). */
export async function renderClassificacaoOg({
  titulo,
  linhas,
  zonas,
  cores,
}: DadosClassificacao): Promise<ImageResponse> {
  const { medium, bold, logoSrc } = await carregarAssets()
  const accent = cores.primaria && HEX6.test(cores.primaria) ? cores.primaria : ROXO

  const visiveis = linhas.slice(0, MAX_LINHAS)
  const escudos = await Promise.all(
    visiveis.map((l) => {
      const url = l.escudoUrl ?? l.avatarUrl ?? null
      return url ? escudoDataURL(url) : Promise.resolve(null)
    })
  )
  const restantes = linhas.length - visiveis.length
  const t = titulo?.trim() || "Campeonato"
  const height = alturaDaClassificacao(visiveis.length, restantes > 0)

  // Legenda de zonas (só na divisão): mostra o que estiver presente.
  const temAcesso = (zonas?.acesso.length ?? 0) > 0
  const temRebaix = (zonas?.rebaixamento.length ?? 0) > 0
  const temPlayoff =
    (zonas?.playoffAcesso.length ?? 0) > 0 || (zonas?.playoffRebaixamento.length ?? 0) > 0

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
        <div style={{ display: "flex", fontSize: 44, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 24 }}>
          {cortar(t, 30)}
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: TEXTO, marginTop: 4, lineHeight: 1 }}>
          CLASSIFICAÇÃO
        </div>
        <div style={{ display: "flex", width: 160, height: 8, backgroundColor: accent, borderRadius: 9999, margin: "24px 0 24px" }} />

        <CabecalhoTabela />

        {/* Linhas */}
        <div style={{ display: "flex", flexDirection: "column", gap: LINHA_GAP, marginTop: 10 }}>
          {visiveis.map((l, i) => (
            <LinhaTabela
              key={l.participanteId}
              linha={l}
              escudoData={escudos[i]}
              accent={accent}
              zonaCor={corDaZona(l.posicao, zonas)}
            />
          ))}
          {restantes > 0 ? (
            <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: TEXTO_SUAVE, marginTop: 8 }}>
              {`+${restantes} competidor${restantes > 1 ? "es" : ""}`}
            </div>
          ) : null}
        </div>

        {/* Legenda de zonas + rodapé */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: "auto", paddingTop: 20 }}>
          {temAcesso || temRebaix || temPlayoff ? (
            <div style={{ display: "flex", gap: 24 }}>
              {temAcesso ? <LegendaZona cor={VERDE} texto="Acesso" /> : null}
              {temPlayoff ? <LegendaZona cor={OURO} texto="Playoff" /> : null}
              {temRebaix ? <LegendaZona cor={VERMELHO} texto="Rebaixamento" /> : null}
            </div>
          ) : null}
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: TEXTO_SUAVE }}>
            Acompanhe no Goliseu
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height,
      fonts: [
        { name: "Space Grotesk", data: paraArrayBuffer(medium), weight: 500, style: "normal" },
        { name: "Space Grotesk", data: paraArrayBuffer(bold), weight: 700, style: "normal" },
      ],
    }
  )
}

function LegendaZona({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", width: 20, height: 20, borderRadius: 6, backgroundColor: cor }} />
      <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: TEXTO_SUAVE }}>{texto}</div>
    </div>
  )
}
