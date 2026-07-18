import type { PartidaCronologica } from "@/features/standings/insights"

import type { GolDemo, TorneioDemo } from "@/features/demo/store/tipos"

// Torneio de liga (pontos corridos) gerado por round-robin DETERMINÍSTICO — sem
// Math.random (fixtures estáveis p/ SSR e testes). Placares vêm de um modelo por
// força + RNG semeado; inclui W.O., duplo W.O., goleadas, uma sequência de
// vitórias/clean sheets do líder e várias partidas EM ANDAMENTO (para o placar
// interativo mexer na tabela ao vivo).

/** 12 competidores: 10 clubes + 2 por-nome (demonstra ambos os mundos). */
const TIMES: string[] = [
  "c-leoes",
  "c-tempestade",
  "c-montanha",
  "c-litoral",
  "c-vulcao",
  "c-aurora",
  "c-planalto",
  "c-cometa",
  "c-baluarte",
  "c-farol",
  "p-ataias",
  "p-danilo",
]

/** Força relativa (index em TIMES → força). O líder (c-leoes) é o mais forte. */
const FORCA: Record<string, number> = {
  "c-leoes": 11,
  "c-tempestade": 10,
  "c-montanha": 8,
  "c-litoral": 8,
  "c-vulcao": 7,
  "c-aurora": 6,
  "c-planalto": 5,
  "c-cometa": 5,
  "c-baluarte": 4,
  "c-farol": 3,
  "p-ataias": 6,
  "p-danilo": 2,
}

/** Artilheiro(s) por time (grafia exibida). */
const ARTILHEIROS: Record<string, string[]> = {
  "c-leoes": ["Rondó", "Válber"],
  "c-tempestade": ["Ítalo", "Nen"],
  "c-montanha": ["Pardal"],
  "c-litoral": ["Guto", "Serj"],
  "c-vulcao": ["Kadu"],
  "c-aurora": ["Bilé"],
  "c-planalto": ["Dodô"],
  "c-cometa": ["Zeca"],
  "c-baluarte": ["Timbó"],
  "c-farol": ["Nal"],
  "p-ataias": ["Ataias"],
  "p-danilo": ["Danilo"],
}

/** LCG semeado — determinismo total. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** Circle method: rodadas de um turno único para N par. */
function rodadasRoundRobin(times: string[]): [string, string][][] {
  const n = times.length
  const arr = [...times]
  const rodadas: [string, string][][] = []
  for (let r = 0; r < n - 1; r++) {
    const jogos: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      // Alterna mando para variar (não afeta o motor, só leitura).
      jogos.push(r % 2 === 0 ? [a, b] : [b, a])
    }
    rodadas.push(jogos)
    // rotaciona mantendo o primeiro fixo
    arr.splice(1, 0, arr.pop() as string)
  }
  return rodadas
}

function placar(forcaA: number, forcaB: number, r: () => number): [number, number] {
  const base = (f: number, adv: number) =>
    Math.max(0, Math.round((f - adv) / 3 + r() * 3))
  return [base(forcaA, forcaB), base(forcaB, forcaA)]
}

const ISO_BASE = Date.parse("2026-05-01T15:00:00.000Z")
const DIA = 86_400_000

function construir(): TorneioDemo {
  const rodadas = rodadasRoundRobin(TIMES)
  const totalRodadas = rodadas.length // 11
  const r = rng(20260501)
  const partidas: PartidaCronologica[] = []
  const gols: GolDemo[] = []

  rodadas.forEach((jogos, ri) => {
    const rodada = ri + 1
    // Últimas 3 rodadas ficam EM ANDAMENTO (placar interativo).
    const emAndamento = rodada > totalRodadas - 3
    jogos.forEach(([a, b], gi) => {
      const id = `m-liga-r${rodada}-${gi}`
      const criadaEm = new Date(ISO_BASE + ri * 3 * DIA + gi * 3600_000).toISOString()

      // W.O. plantados (consistentes: m.wo/woVencedor casados).
      if (rodada === 2 && gi === 0) {
        partidas.push({
          id,
          rodada,
          criadaEm,
          participante_1: a,
          participante_2: b,
          placar_1: 0,
          placar_2: 0,
          status: "encerrada",
          woVencedor: a,
        })
        return
      }
      if (rodada === 3 && gi === 1) {
        partidas.push({
          id,
          rodada,
          criadaEm,
          participante_1: a,
          participante_2: b,
          placar_1: 0,
          placar_2: 0,
          status: "encerrada",
          woDuplo: true,
        })
        return
      }

      if (emAndamento) {
        partidas.push({
          id,
          rodada,
          criadaEm,
          participante_1: a,
          participante_2: b,
          placar_1: 0,
          placar_2: 0,
          status: "em_andamento",
        })
        return
      }

      const [p1, p2] = placar(FORCA[a], FORCA[b], r)
      partidas.push({
        id,
        rodada,
        criadaEm,
        participante_1: a,
        participante_2: b,
        placar_1: p1,
        placar_2: p2,
        status: "encerrada",
      })
      // Gols (autores) das partidas encerradas reais.
      distribuirGols(gols, id, 1, a, p1, r)
      distribuirGols(gols, id, 2, b, p2, r)
    })
  })

  return {
    id: "demo-liga",
    nome: "Liga Goliseu — Série Ouro",
    formato: "liga",
    status: "ativo",
    criadoEm: new Date(ISO_BASE - 7 * DIA).toISOString(),
    corPrimaria: "#7c3aed",
    corSecundaria: "#f5c518",
    regras: { vitoria: 3, empate: 1, derrota: 0 },
    tiebreaker: "cbf",
    participantes: TIMES,
    partidas,
    gols,
    chave: [],
    terceiroLugar: false,
    aviso: null,
  }
}

function distribuirGols(
  acc: GolDemo[],
  matchId: string,
  lado: 1 | 2,
  time: string,
  qtd: number,
  r: () => number
) {
  if (qtd <= 0) return
  const nomes = ARTILHEIROS[time] ?? [time]
  let restante = qtd
  // Distribui os gols entre os artilheiros do time (o principal leva mais).
  const contagem: Record<string, number> = {}
  while (restante > 0) {
    const idx = r() < 0.7 ? 0 : Math.min(nomes.length - 1, 1)
    const nome = nomes[idx]
    contagem[nome] = (contagem[nome] ?? 0) + 1
    restante--
  }
  for (const [jogador, g] of Object.entries(contagem)) {
    acc.push({ matchId, lado, jogador, gols: g, contra: false })
  }
}

export const TORNEIO_LIGA: TorneioDemo = construir()
