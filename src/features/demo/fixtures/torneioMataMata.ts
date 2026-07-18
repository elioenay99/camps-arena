import type { PartidaDaChave } from "@/features/standings/data/getTournamentClassificacao"

import { nomeDe } from "@/features/demo/fixtures/identidades"
import type { TorneioDemo } from "@/features/demo/store/tipos"

// Chave de 8 (quartas → semis → final + disputa de 3º lugar), jogo único,
// campeão decidido (dispara a CelebracaoTitulo). Ids de lado = ids de competidor.
// POSICAO_TERCEIRO_LUGAR = 2 na rodada da final (motor gerarChaveMataMata).

function jogo(
  id: string,
  rodada: number,
  posicao: number,
  a: string,
  b: string,
  pa: number,
  pb: number
): PartidaDaChave {
  return {
    id,
    rodada,
    posicao,
    perna: null,
    participante_1: a,
    participante_2: b,
    nome_1: nomeDe(a),
    nome_2: nomeDe(b),
    placar_1: pa,
    placar_2: pb,
    status: "encerrada",
    escudo_1: null,
    escudo_2: null,
    wo: false,
    woVencedor: null,
  }
}

const CHAVE: PartidaDaChave[] = [
  // Quartas (rodada 1, posições 1-4)
  jogo("mm-q1", 1, 1, "c-leoes", "c-farol", 3, 0),
  jogo("mm-q2", 1, 2, "c-tempestade", "p-ataias", 2, 1),
  jogo("mm-q3", 1, 3, "c-montanha", "c-vulcao", 1, 2),
  jogo("mm-q4", 1, 4, "c-litoral", "c-aurora", 2, 0),
  // Semis (rodada 2, posições 1-2)
  jogo("mm-s1", 2, 1, "c-leoes", "c-litoral", 2, 1),
  jogo("mm-s2", 2, 2, "c-tempestade", "c-vulcao", 2, 1),
  // Final + 3º lugar (rodada 3): final posição 1, 3º lugar posição 2
  jogo("mm-final", 3, 1, "c-leoes", "c-tempestade", 3, 1),
  jogo("mm-3o", 3, 2, "c-litoral", "c-vulcao", 2, 0),
]

export const TORNEIO_MATA_MATA: TorneioDemo = {
  id: "demo-copa-relampago",
  nome: "Copa Relâmpago",
  formato: "mata_mata",
  status: "encerrado",
  criadoEm: new Date(Date.parse("2026-03-10T12:00:00.000Z")).toISOString(),
  corPrimaria: "#0ea5e9",
  corSecundaria: "#f5c518",
  regras: { vitoria: 3, empate: 1, derrota: 0 },
  tiebreaker: "cbf",
  participantes: [
    "c-leoes",
    "c-farol",
    "c-tempestade",
    "p-ataias",
    "c-montanha",
    "c-vulcao",
    "c-litoral",
    "c-aurora",
  ],
  partidas: [],
  gols: [],
  chave: CHAVE,
  terceiroLugar: true,
  aviso: null,
}
