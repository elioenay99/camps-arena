import type { PartidaCronologica } from "@/features/standings/insights"
import type { StandingsZonas } from "@/features/standings/components/StandingsTable"
import type {
  RegrasPontuacao,
  TiebreakerPreset,
} from "@/features/standings/computeStandings"

import type { GolDemo } from "@/features/demo/store/tipos"

export interface DivisaoDemo {
  id: string
  nome: string
  participantes: string[]
  partidas: PartidaCronologica[]
  gols: GolDemo[]
  zonas: StandingsZonas
}

export interface PiramideDemo {
  id: string
  nome: string
  corPrimaria: string | null
  corSecundaria: string | null
  regras: RegrasPontuacao
  tiebreaker: TiebreakerPreset
  divisoes: DivisaoDemo[]
}

const FORCA: Record<string, number> = {
  "c-leoes": 11,
  "c-tempestade": 10,
  "c-montanha": 8,
  "c-litoral": 7,
  "c-vulcao": 6,
  "c-aurora": 5,
  "c-planalto": 4,
  "c-cometa": 3,
  "c-baluarte": 9,
  "c-farol": 7,
  "c-raizes": 5,
  "c-orion": 4,
  "c-pantanal": 3,
  "c-sertao": 2,
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function rodadasRoundRobin(times: string[]): [string, string][][] {
  const arr = [...times]
  const n = arr.length
  const rodadas: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const jogos: [string, string][] = []
    for (let i = 0; i < n / 2; i++) jogos.push([arr[i], arr[n - 1 - i]])
    rodadas.push(jogos)
    arr.splice(1, 0, arr.pop() as string)
  }
  return rodadas
}

function gerarDivisao(
  id: string,
  nome: string,
  times: string[],
  zonas: StandingsZonas,
  seed: number
): DivisaoDemo {
  const rodadas = rodadasRoundRobin(times)
  const r = rng(seed)
  const partidas: PartidaCronologica[] = []
  const gols: GolDemo[] = []
  const base = Date.parse("2026-04-01T15:00:00.000Z")
  rodadas.forEach((jogos, ri) => {
    jogos.forEach(([a, b], gi) => {
      const mid = `${id}-r${ri + 1}-${gi}`
      const p1 = Math.max(0, Math.round((FORCA[a] - FORCA[b]) / 3 + r() * 3))
      const p2 = Math.max(0, Math.round((FORCA[b] - FORCA[a]) / 3 + r() * 3))
      partidas.push({
        id: mid,
        rodada: ri + 1,
        criadaEm: new Date(base + ri * 2 * 86_400_000 + gi * 3600_000).toISOString(),
        participante_1: a,
        participante_2: b,
        placar_1: p1,
        placar_2: p2,
        status: "encerrada",
      })
      if (p1 > 0) gols.push({ matchId: mid, lado: 1, jogador: `${a}-9`, gols: p1, contra: false })
      if (p2 > 0) gols.push({ matchId: mid, lado: 2, jogador: `${b}-9`, gols: p2, contra: false })
    })
  })
  return { id, nome, participantes: times, partidas, gols, zonas }
}

export const PIRAMIDE: PiramideDemo = {
  id: "demo-piramide",
  nome: "Pirâmide Goliseu",
  corPrimaria: "#7c3aed",
  corSecundaria: "#f5c518",
  regras: { vitoria: 3, empate: 1, derrota: 0 },
  tiebreaker: "cbf",
  divisoes: [
    gerarDivisao(
      "serie-a",
      "Série A",
      ["c-leoes", "c-tempestade", "c-baluarte", "c-montanha", "c-litoral", "c-farol", "c-vulcao", "c-aurora"],
      { acesso: [], rebaixamento: [7, 8], playoffRebaixamento: [6] },
      910001
    ),
    gerarDivisao(
      "serie-b",
      "Série B",
      ["c-planalto", "c-raizes", "c-orion", "c-cometa", "c-pantanal", "c-sertao"],
      { acesso: [1, 2], rebaixamento: [6], playoffAcesso: [3, 4] },
      910002
    ),
  ],
}
