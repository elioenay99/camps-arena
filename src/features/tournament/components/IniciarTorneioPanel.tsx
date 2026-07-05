import { ListOrdered } from "lucide-react"

import {
  LIGA_MAX_PARTICIPANTES,
  previaLiga,
} from "@/features/league/gerarTabelaLiga"
import { IniciarTorneioButton } from "@/features/tournament/components/IniciarTorneioButton"
import {
  PainelInicioShell,
  PreviaBox,
} from "@/features/tournament/components/iniciar-panel-ui"
import type { TournamentStatus } from "@/lib/supabase/database.types"

/**
 * Painel "Iniciar torneio" — RSC puro, renderizado SÓ para o dono do torneio de
 * pontos corridos em rascunho (gate na página). A prévia usa o MESMO motor da
 * geração (fonte
 * única): o que o dono vê é o que a action insere.
 */
export function IniciarTorneioPanel({
  tournamentId,
  qtdParticipantes,
  idaEVolta,
  status = "rascunho",
}: {
  tournamentId: string
  qtdParticipantes: number
  idaEVolta: boolean
  status?: TournamentStatus
}) {
  const previa = previaLiga(qtdParticipantes, idaEVolta)
  const participantesSuficientes = qtdParticipantes >= 2
  const dentroDoLimite = qtdParticipantes <= LIGA_MAX_PARTICIPANTES

  return (
    <PainelInicioShell
      Icon={ListOrdered}
      formatoLabel="Pontos corridos"
      qtdClubes={qtdParticipantes}
      chips={idaEVolta ? ["ida e volta"] : []}
      status={status}
    >
      {participantesSuficientes && dentroDoLimite ? (
        <PreviaBox>
          {`Ao iniciar, a tabela completa é gerada: ${previa.partidas} ${previa.partidas === 1 ? "partida" : "partidas"} em ${previa.rodadas} ${previa.rodadas === 1 ? "rodada" : "rodadas"}. A lista de clubes fica fixa; técnicos podem assumir as vagas a qualquer momento.`}
        </PreviaBox>
      ) : participantesSuficientes ? (
        <p className="text-destructive text-sm" role="status">
          {`O torneio aceita no máximo ${LIGA_MAX_PARTICIPANTES} clubes. Crie o torneio novamente com menos clubes.`}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          É preciso pelo menos 2 clubes.
        </p>
      )}

      <div>
        <IniciarTorneioButton
          tournamentId={tournamentId}
          disabled={!participantesSuficientes || !dentroDoLimite}
        />
      </div>
    </PainelInicioShell>
  )
}
