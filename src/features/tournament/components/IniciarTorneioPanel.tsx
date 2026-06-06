import {
  LIGA_MAX_PARTICIPANTES,
  previaLiga,
} from "@/features/league/gerarTabelaLiga"
import { IniciarTorneioButton } from "@/features/tournament/components/IniciarTorneioButton"

/**
 * Painel "Iniciar torneio" — RSC puro, renderizado SÓ para o dono de liga em
 * rascunho (gate na página). A prévia usa o MESMO motor da geração (fonte
 * única): o que o dono vê é o que a action insere.
 */
export function IniciarTorneioPanel({
  tournamentId,
  qtdParticipantes,
  idaEVolta,
}: {
  tournamentId: string
  qtdParticipantes: number
  idaEVolta: boolean
}) {
  const previa = previaLiga(qtdParticipantes, idaEVolta)
  const participantesSuficientes = qtdParticipantes >= 2
  const dentroDoLimite = qtdParticipantes <= LIGA_MAX_PARTICIPANTES

  return (
    <section
      aria-labelledby="iniciar-titulo"
      className="flex flex-col gap-3 rounded-lg border px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="iniciar-titulo" className="text-lg font-semibold">
          Iniciar torneio
        </h2>
        <p className="text-muted-foreground text-sm">
          {`Liga em rascunho • ${qtdParticipantes} ${qtdParticipantes === 1 ? "participante confirmado" : "participantes confirmados"} • ${idaEVolta ? "ida e volta" : "ida simples"}`}
        </p>
      </div>

      {participantesSuficientes && dentroDoLimite ? (
        <p className="text-sm">
          {`Ao iniciar, a tabela completa é gerada: ${previa.partidas} ${previa.partidas === 1 ? "partida" : "partidas"} em ${previa.rodadas} ${previa.rodadas === 1 ? "rodada" : "rodadas"}. Depois disso ninguém mais entra na liga.`}
        </p>
      ) : participantesSuficientes ? (
        <p className="text-destructive text-sm" role="status">
          {`A liga aceita no máximo ${LIGA_MAX_PARTICIPANTES} participantes. Remova participantes para iniciar.`}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" role="status">
          A liga precisa de pelo menos 2 participantes confirmados. Compartilhe
          o link de convite abaixo para chamar os jogadores.
        </p>
      )}

      <div>
        <IniciarTorneioButton
          tournamentId={tournamentId}
          disabled={!participantesSuficientes || !dentroDoLimite}
        />
      </div>
    </section>
  )
}
