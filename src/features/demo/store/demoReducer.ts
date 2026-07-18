import type { TournamentFormat, TournamentStatus } from "@/lib/supabase/database.types"

import type { PerfilDemo } from "./perfil"
import type {
  GolDemo,
  IdentidadeDemo,
  ItemVitrineDemo,
  PartidaAtivaDemo,
  TorneioDemo,
} from "./tipos"

export interface DemoState {
  identidades: Record<string, IdentidadeDemo>
  torneios: TorneioDemo[]
  vitrine: ItemVitrineDemo[]
  partidasAtivas: PartidaAtivaDemo[]
  perfil: PerfilDemo
}

/** Autor editado no modal (espelha `AutorGolInput`). */
export interface AutorEditado {
  lado: 1 | 2
  jogador: string | null
  gols: number
  contra: boolean
}

export type DemoAction =
  | {
      type: "EDITAR_PLACAR"
      torneioId: string
      matchId: string
      placar_1: number
      placar_2: number
    }
  | {
      type: "REGISTRAR_AUTORES"
      torneioId: string
      matchId: string
      autores: AutorEditado[]
    }
  | { type: "CRIAR_TORNEIO"; nome: string; formato: TournamentFormat }
  | {
      type: "EDITAR_TORNEIO"
      id: string
      nome: string
      formato: TournamentFormat
    }
  | { type: "EXCLUIR_TORNEIO"; id: string }
  | { type: "MUDAR_STATUS"; id: string; status: TournamentStatus }
  | { type: "TOGGLE_LISTAR"; id: string }
  | { type: "TROCAR_PERFIL"; perfil: PerfilDemo }
  | { type: "REINICIAR"; seed: DemoState }

function novoId(prefixo: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  return `${prefixo}-${rnd}`
}

/**
 * Aplica um novo placar a uma partida (pontos corridos OU chave), marcando-a
 * encerrada. Editar o placar = registrar um RESULTADO REAL → as flags de W.O.
 * são LIMPAS (senão `computeStandings`/`resultadoDoLado`/`calcularMuralha` entram
 * no ramo W.O. e ignorariam os gols novos; a tabela contradiria o card/artilharia).
 */
function aplicarPlacar(
  torneio: TorneioDemo,
  matchId: string,
  placar_1: number,
  placar_2: number
): TorneioDemo {
  const partidas = torneio.partidas.map((p) =>
    p.id === matchId
      ? {
          ...p,
          placar_1,
          placar_2,
          status: "encerrada" as const,
          woVencedor: undefined,
          woDuplo: undefined,
        }
      : p
  )
  const chave = torneio.chave.map((c) =>
    c.id === matchId
      ? {
          ...c,
          placar_1,
          placar_2,
          status: "encerrada" as const,
          wo: undefined,
          woVencedor: undefined,
        }
      : c
  )
  return { ...torneio, partidas, chave }
}

/** Substitui os gols de UMA partida (replace por-partida, como o writer real por-lado). */
function aplicarAutores(
  torneio: TorneioDemo,
  matchId: string,
  autores: AutorEditado[]
): TorneioDemo {
  const outros = torneio.gols.filter((g) => g.matchId !== matchId)
  const novos: GolDemo[] = autores
    .filter((a) => (a.gols ?? 0) > 0)
    .map((a) => ({
      matchId,
      lado: a.lado,
      jogador: (a.jogador ?? "").trim(),
      gols: a.gols,
      contra: a.contra,
    }))
    .filter((g) => g.contra || g.jogador !== "")
  return { ...torneio, gols: [...outros, ...novos] }
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "EDITAR_PLACAR":
      return {
        ...state,
        torneios: state.torneios.map((t) =>
          t.id === action.torneioId
            ? aplicarPlacar(t, action.matchId, action.placar_1, action.placar_2)
            : t
        ),
      }
    case "REGISTRAR_AUTORES":
      return {
        ...state,
        torneios: state.torneios.map((t) =>
          t.id === action.torneioId
            ? aplicarAutores(t, action.matchId, action.autores)
            : t
        ),
      }
    case "CRIAR_TORNEIO": {
      const novo: TorneioDemo = {
        id: novoId("torneio"),
        nome: action.nome.trim() || "Novo torneio",
        formato: action.formato,
        status: "rascunho",
        criadoEm: new Date().toISOString(),
        corPrimaria: null,
        corSecundaria: null,
        regras: { vitoria: 3, empate: 1, derrota: 0 },
        tiebreaker: "cbf",
        participantes: [],
        partidas: [],
        gols: [],
        chave: [],
        terceiroLugar: false,
        aviso: null,
      }
      return { ...state, torneios: [novo, ...state.torneios] }
    }
    case "EDITAR_TORNEIO":
      return {
        ...state,
        torneios: state.torneios.map((t) =>
          t.id === action.id
            ? { ...t, nome: action.nome.trim() || t.nome, formato: action.formato }
            : t
        ),
      }
    case "EXCLUIR_TORNEIO":
      return {
        ...state,
        torneios: state.torneios.filter((t) => t.id !== action.id),
      }
    case "MUDAR_STATUS":
      return {
        ...state,
        torneios: state.torneios.map((t) =>
          t.id === action.id ? { ...t, status: action.status } : t
        ),
      }
    case "TOGGLE_LISTAR":
      return {
        ...state,
        vitrine: state.vitrine.map((v) =>
          v.id === action.id ? { ...v, listado: !v.listado } : v
        ),
      }
    case "TROCAR_PERFIL":
      return { ...state, perfil: action.perfil }
    case "REINICIAR":
      return action.seed
    default:
      return state
  }
}
