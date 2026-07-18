import type {
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
} from "@/lib/supabase/database.types"
import type {
  RegrasPontuacao,
  TiebreakerPreset,
} from "@/features/standings/computeStandings"
import type { PartidaCronologica } from "@/features/standings/insights"
import type { PartidaDaChave } from "@/features/standings/data/getTournamentClassificacao"

// Tipos de domínio da demonstração. Tudo é fictício e vive em memória; os ids de
// lado das partidas (`participante_1`/`participante_2`) referenciam diretamente o
// id do competidor em `identidades`, o que deixa os motores puros (standings /
// insights / muralha / artilharia) derivarem tudo sem mapeamento extra.

/** Identidade de um competidor fictício. */
export interface IdentidadeDemo {
  id: string
  nome: string
  /**
   * Discriminador competitivo × avulso (espelha `ehCompetitivo` do produto):
   * `true` → identidade de CLUBE (escudo/`TeamCrest`); `false` → PESSOA
   * (foto/`UserAvatar`). Nunca inferir por truthiness de clube.
   */
  ehCompetitivo: boolean
  /** Sempre `null` na demo (cai no fallback de iniciais — zero rede ao Storage). */
  escudoUrl: string | null
  /** Sempre `null` na demo (fallback de iniciais). */
  avatarUrl: string | null
  /** Técnico atual (rótulo de UI); opcional. */
  tecnico?: string | null
}

/** Um gol fictício (autor) de uma partida — insumo da artilharia. */
export interface GolDemo {
  matchId: string
  lado: 1 | 2
  jogador: string
  gols: number
  /** Gol contra: conta no placar, fora do ranking. */
  contra: boolean
}

/** Um torneio fictício. */
export interface TorneioDemo {
  id: string
  nome: string
  formato: TournamentFormat
  status: TournamentStatus
  /** ISO — ordem/leitura temporal (recentes × antigos). */
  criadoEm: string
  corPrimaria: string | null
  corSecundaria: string | null
  regras: RegrasPontuacao
  tiebreaker: TiebreakerPreset
  /** Ids de competidores participantes (referenciam `identidades`). */
  participantes: string[]
  /** Partidas de pontos corridos (formato `liga`). */
  partidas: PartidaCronologica[]
  /** Autores dos gols das partidas. */
  gols: GolDemo[]
  /** Chave eliminatória (formato `mata_mata`). */
  chave: PartidaDaChave[]
  /** Torneio com disputa de 3º lugar. */
  terceiroLugar: boolean
  /** Aviso/alerta visível que exige atenção (ex.: W.O. travado). `null` = sem alerta. */
  aviso: string | null
}

/** Um item da vitrine pública (Explorar). */
export interface ItemVitrineDemo {
  id: string
  tipo: "torneio" | "liga"
  nome: string
  formato: TournamentFormat
  status: TournamentStatus
  criadoEm: string
  competidores: number
  corPrimaria: string | null
  corSecundaria: string | null
  /** Está listado na vitrine? (toggle otimista). */
  listado: boolean
}

/** Uma partida ativa do HUB. */
export interface PartidaAtivaDemo {
  id: string
  torneioId: string
  torneioNome: string
  rodada: number | null
  status: MatchStatus
}

export type { MatchStatus, TournamentFormat, TournamentStatus }
