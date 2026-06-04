import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { MatchScoreModalConnected } from "@/features/match/components/MatchScoreModalConnected"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import type {
  ClubeResumo,
  ParticipanteResumo,
  PartidaAtiva,
} from "@/features/match/data/getActiveMatches"
import type { MatchStatus } from "@/lib/supabase/database.types"
import type { ParticipantePartida } from "@/features/match/components/MatchScoreModal"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/** Converte a linha do banco no formato que o modal espera (com clube). */
function paraParticipante(
  p: ParticipanteResumo | null,
  clube: ClubeResumo | null
): ParticipantePartida {
  const base = p
    ? { nome: p.nome?.trim() || "Sem nome", avatarUrl: p.avatar, celular: p.celular }
    : { nome: "A definir", avatarUrl: null, celular: null }
  return {
    ...base,
    clube: clube ? { nome: clube.nome, escudoUrl: clube.escudo_url } : null,
  }
}

export function MatchCard({ partida }: { partida: PartidaAtiva }) {
  const p1 = paraParticipante(partida.participante_1, partida.time_1)
  const p2 = paraParticipante(partida.participante_2, partida.time_2)
  const torneio = partida.tournament.titulo.trim() || "Torneio"

  const tituloPartida = `${p1.nome} x ${p2.nome}`
  const subtitulo = `${torneio} • ${LABEL_STATUS[partida.status]}`
  const descricao = `${p1.nome} enfrenta ${p2.nome}`

  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>{tituloPartida}</h2>
          </CardTitle>
          <CardDescription>{subtitulo}</CardDescription>
        </CardHeader>

        <CardContent className="flex items-center justify-center gap-3 py-2">
          <div className="flex items-center gap-2">
            <TeamCrest
              nome={p1.clube?.nome ?? p1.nome}
              escudoUrl={p1.clube?.escudoUrl}
              size={28}
            />
            <span className="text-3xl font-bold tabular-nums" aria-hidden="true">
              {partida.placar_1}
            </span>
          </div>
          <span className="text-muted-foreground" aria-hidden="true">
            x
          </span>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums" aria-hidden="true">
              {partida.placar_2}
            </span>
            <TeamCrest
              nome={p2.clube?.nome ?? p2.nome}
              escudoUrl={p2.clube?.escudoUrl}
              size={28}
            />
          </div>
          <span className="sr-only">
            {`Placar atual: ${p1.nome} ${partida.placar_1}, ${p2.nome} ${partida.placar_2}`}
          </span>
        </CardContent>

        <CardFooter>
          <MatchScoreModalConnected
            matchId={partida.id}
            tituloPartida={tituloPartida}
            subtitulo={subtitulo}
            descricao={descricao}
            participante1={p1}
            participante2={p2}
            placarInicial1={partida.placar_1}
            placarInicial2={partida.placar_2}
            trigger={
              <Button
                aria-label={`Menu da partida ${tituloPartida}`}
                className="w-full rounded-full"
              >
                Menu da Partida
              </Button>
            }
          />
        </CardFooter>
      </Card>
    </li>
  )
}
