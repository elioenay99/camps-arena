import { computeStandings } from "@/features/standings/computeStandings"
import {
  calcularDestaques,
  calcularForma,
  calcularMuralha,
  type CompetidorMuralha,
  type Destaques,
  type ItemForma,
  type LinhaMuralha,
} from "@/features/standings/insights"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

import type { IdentidadeDemo, TorneioDemo } from "@/features/demo/store/tipos"

export interface ClassificacaoDerivada {
  linhas: LinhaComNome[]
  destaques: Destaques
  nomePorId: Map<string, string>
  formaPorParticipante: Map<string, ItemForma[]>
  muralha: LinhaMuralha[]
}

/** Monta `LinhaComNome[]` a partir de linhas cruas + identidades (identidade por ehCompetitivo). */
export function comNome(
  brutas: ReturnType<typeof computeStandings>,
  identidades: Record<string, IdentidadeDemo>
): LinhaComNome[] {
  return brutas.map((l) => {
    const ident = identidades[l.participanteId]
    return {
      ...l,
      nome: ident?.nome ?? "Competidor",
      escudoUrl: ident?.ehCompetitivo ? ident.escudoUrl : null,
      avatarUrl: ident && !ident.ehCompetitivo ? ident.avatarUrl : null,
    }
  })
}

/**
 * Deriva TUDO da classificação de um torneio de liga a partir das partidas do
 * store, pelos motores puros — nunca duplica regras de W.O./promédio/desempate.
 * Recompõe ao vivo após qualquer `EDITAR_PLACAR`.
 */
export function derivarClassificacao(
  torneio: TorneioDemo,
  identidades: Record<string, IdentidadeDemo>
): ClassificacaoDerivada {
  const brutas = computeStandings(torneio.regras, torneio.partidas, torneio.tiebreaker)

  const linhas: LinhaComNome[] = brutas.map((l) => {
    const ident = identidades[l.participanteId]
    return {
      ...l,
      nome: ident?.nome ?? "Competidor",
      escudoUrl: ident?.ehCompetitivo ? ident.escudoUrl : null,
      avatarUrl: ident && !ident.ehCompetitivo ? ident.avatarUrl : null,
    }
  })

  const nomePorId = new Map<string, string>(
    torneio.participantes.map((id) => [id, identidades[id]?.nome ?? "Competidor"])
  )

  const formaPorParticipante = calcularForma(torneio.partidas)
  const destaques = calcularDestaques(linhas, torneio.partidas)

  const mapaLadoCompetidor = new Map<string, CompetidorMuralha>(
    torneio.participantes.map((id) => {
      const ident = identidades[id]
      return [
        id,
        {
          competitorId: id,
          nome: ident?.nome ?? "Competidor",
          escudoUrl: ident?.ehCompetitivo ? ident.escudoUrl : null,
        },
      ]
    })
  )
  const muralha = calcularMuralha(torneio.partidas, mapaLadoCompetidor)

  return { linhas, destaques, nomePorId, formaPorParticipante, muralha }
}
