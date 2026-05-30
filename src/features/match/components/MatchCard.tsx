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
import type {
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

/** Converte a linha do banco no formato que o modal espera. */
function paraParticipante(p: ParticipanteResumo | null): ParticipantePartida {
  if (!p) return { nome: "A definir", avatarUrl: null, celular: null }
  return {
    nome: p.nome?.trim() || "Sem nome",
    avatarUrl: p.avatar,
    celular: p.celular,
  }
}

export function MatchCard({ partida }: { partida: PartidaAtiva }) {
  const p1 = paraParticipante(partida.participante_1)
  const p2 = paraParticipante(partida.participante_2)
  const torneio = partida.tournament?.titulo?.trim() || "Torneio"

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

        <CardContent className="flex items-center justify-center gap-4 py-2">
          <span className="text-3xl font-bold tabular-nums" aria-hidden="true">
            {partida.placar_1}
          </span>
          <span className="text-muted-foreground" aria-hidden="true">
            x
          </span>
          <span className="text-3xl font-bold tabular-nums" aria-hidden="true">
            {partida.placar_2}
          </span>
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
