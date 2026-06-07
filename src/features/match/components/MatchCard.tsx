import Link from "next/link"

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
import { MessageCircle } from "lucide-react"

import type { MatchStatus } from "@/lib/supabase/database.types"
import type { ParticipantePartida } from "@/features/match/components/MatchScoreModal"
import { linkWhatsApp, mensagemConvocacao } from "@/lib/whatsapp"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/** Converte a linha do banco no formato que o modal espera (com clube). */
function paraParticipante(
  p: ParticipanteResumo | null,
  clube: ClubeResumo | null,
  mensagemWhatsApp?: string
): ParticipantePartida {
  const base = p
    ? { nome: p.nome?.trim() || "Sem nome", avatarUrl: p.avatar, celular: p.celular }
    : { nome: "A definir", avatarUrl: null, celular: null }
  return {
    ...base,
    mensagemWhatsApp,
    clube: clube ? { nome: clube.nome, escudoUrl: clube.escudo_url } : null,
  }
}

export function MatchCard({
  partida,
  userId,
}: {
  partida: PartidaAtiva
  /** Usuário logado — habilita o atalho de convocação quando ele joga a partida. */
  userId?: string
}) {
  const torneio = partida.tournament.titulo.trim() || "Torneio"
  // Mensagem por LADO (sauda o destinatário) — montada no servidor (RSC).
  const mensagemPara = (destinatario: ParticipanteResumo | null) =>
    mensagemConvocacao({
      adversario: destinatario?.nome,
      titulo: torneio,
      tournamentId: partida.tournament.id,
    })
  const p1 = paraParticipante(
    partida.participante_1,
    partida.time_1,
    mensagemPara(partida.participante_1)
  )
  const p2 = paraParticipante(
    partida.participante_2,
    partida.time_2,
    mensagemPara(partida.participante_2)
  )

  const tituloPartida = `${p1.nome} x ${p2.nome}`
  const subtitulo = `${torneio} • ${LABEL_STATUS[partida.status]}`
  const descricao = `${p1.nome} enfrenta ${p2.nome}`

  // Atalho de convocação DIRETO no card (re-engajamento): só para quem JOGA
  // a partida, apontando ao adversário com celular válido. Como o card é
  // RSC, o celular só entra no HTML (href) de quem tem direito a vê-lo.
  const adversario =
    userId && partida.participante_1?.id === userId
      ? partida.participante_2
      : userId && partida.participante_2?.id === userId
        ? partida.participante_1
        : null
  const linkConvocacao = adversario
    ? linkWhatsApp(adversario.celular, mensagemPara(adversario))
    : null

  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>{tituloPartida}</h2>
          </CardTitle>
          <CardDescription>
            {/* Título do torneio linka para a classificação (entrada do Tier 2). */}
            <Link
              href={`/dashboard/torneios/${partida.tournament.id}`}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {torneio}
            </Link>
            {` • ${LABEL_STATUS[partida.status]}`}
          </CardDescription>
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

        <CardFooter className="flex-col gap-2">
          {linkConvocacao && adversario ? (
            <Button
              asChild
              className="w-full rounded-full bg-green-700 text-white hover:bg-green-800"
            >
              <a href={linkConvocacao} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" />
                {`Chamar ${adversario.nome?.trim() || "adversário"}`}
                <span className="sr-only"> (abre o WhatsApp em nova aba)</span>
              </a>
            </Button>
          ) : null}
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
