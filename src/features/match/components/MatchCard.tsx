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
  VagaResumo,
} from "@/features/match/data/getActiveMatches"
import { MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"

import type { MatchStatus } from "@/lib/supabase/database.types"
import type { ParticipantePartida } from "@/features/match/components/MatchScoreModal"
import { linkWhatsApp, mensagemConvocacao } from "@/lib/whatsapp"

const LABEL_STATUS: Record<MatchStatus, string> = {
  agendada: "agendada",
  em_andamento: "em andamento",
  encerrada: "encerrada",
}

/**
 * Lado normalizado da partida — abstrai os dois modelos:
 *  - AVULSO: o lado é uma PESSOA (participante); clube é cosmético por partida.
 *  - COMPETITIVO: o lado é um CLUBE (vaga); o técnico é metadado (anulável).
 * `convocavel` carrega o celular de quem recebe a chamada (a pessoa no avulso,
 * o técnico no competitivo) e o nome para saudar; `id` decide quem é o
 * adversário do usuário logado.
 */
interface Lado {
  /** Id de quem "é" o lado para fins de propriedade (user no avulso; vaga no competitivo). */
  ownerId: string | null
  /** Forma exibida no card e passada ao modal (com clube quando houver). */
  participante: ParticipantePartida
  /** Nome para saudar na convocação (pessoa no avulso, técnico no competitivo). */
  nomeConvocacao: string | null
  /** Celular do destinatário da convocação; null → sem botão. */
  celularConvocacao: string | null
}

/** Lado AVULSO: a pessoa é o lado; o clube (time_1/2) é cosmético. */
function ladoAvulso(
  p: ParticipanteResumo | null,
  clube: ClubeResumo | null,
  mensagemWhatsApp: string
): Lado {
  const nome = p?.nome?.trim() || (p ? "Sem nome" : "A definir")
  return {
    ownerId: p?.id ?? null,
    participante: {
      nome,
      avatarUrl: p?.avatar ?? null,
      celular: p?.celular ?? null,
      mensagemWhatsApp,
      clube: clube ? { nome: clube.nome, escudoUrl: clube.escudo_url } : null,
    },
    nomeConvocacao: p?.nome?.trim() || null,
    celularConvocacao: p?.celular ?? null,
  }
}

/** Lado COMPETITIVO: o CLUBE é o lado; o técnico vira detalhe e destinatário. */
function ladoVaga(vaga: VagaResumo | null, mensagemWhatsApp: string): Lado {
  if (!vaga) {
    // Bye na chave (vaga_2 null): lado vazio, sem clube nem técnico.
    return {
      ownerId: null,
      participante: { nome: "A definir", avatarUrl: null, celular: null },
      nomeConvocacao: null,
      celularConvocacao: null,
    }
  }
  const tecnico = vaga.tecnico
  const detalhe = tecnico?.nome?.trim()
    ? `téc. ${tecnico.nome.trim()}`
    : "vaga aberta"
  return {
    ownerId: vaga.id,
    participante: {
      // O NOME exibido é o do CLUBE; o técnico aparece como detalhe e é o
      // destinatário da convocação (nomeConvocacao).
      nome: vaga.clube.nome,
      detalhe,
      nomeConvocacao: tecnico?.nome?.trim() || null,
      avatarUrl: vaga.clube.escudo_url,
      celular: tecnico?.celular ?? null,
      mensagemWhatsApp,
      clube: { nome: vaga.clube.nome, escudoUrl: vaga.clube.escudo_url },
    },
    nomeConvocacao: tecnico?.nome?.trim() || null,
    celularConvocacao: tecnico?.celular ?? null,
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
  // Mensagem por LADO (sauda o destinatário: pessoa no avulso, técnico no
  // competitivo) — montada no servidor (RSC).
  const mensagemPara = (nome: string | null) =>
    mensagemConvocacao({
      adversario: nome,
      titulo: torneio,
      tournamentId: partida.tournament.id,
    })

  // Competitivo ⇔ a partida usa vagas (CHECK garante exclusão mútua com
  // participantes). O bye (vaga_2 null) ainda é competitivo: a vaga_1 define.
  const ehCompetitivo = partida.vaga_1 !== null || partida.vaga_2 !== null

  const l1 = ehCompetitivo
    ? ladoVaga(partida.vaga_1, "")
    : ladoAvulso(partida.participante_1, partida.time_1, "")
  const l2 = ehCompetitivo
    ? ladoVaga(partida.vaga_2, "")
    : ladoAvulso(partida.participante_2, partida.time_2, "")
  // A mensagem depende do destinatário (nome) — preenche após montar os lados.
  l1.participante.mensagemWhatsApp = mensagemPara(l1.nomeConvocacao)
  l2.participante.mensagemWhatsApp = mensagemPara(l2.nomeConvocacao)

  const p1 = l1.participante
  const p2 = l2.participante

  const tituloPartida = `${p1.nome} x ${p2.nome}`
  const subtitulo = `${torneio} • ${LABEL_STATUS[partida.status]}`
  const descricao = `${p1.nome} enfrenta ${p2.nome}`

  // Atalho de convocação DIRETO no card (re-engajamento): só para quem JOGA
  // a partida, apontando ao adversário com celular válido. Como o card é
  // RSC, o celular só entra no HTML (href) de quem tem direito a vê-lo.
  // Avulso: comparo userId aos ids das pessoas. Competitivo: aos ids das
  // vagas (a "minha vaga" é aquela cujo técnico sou eu — o lado oposto é o
  // adversário).
  const minhaVagaId =
    ehCompetitivo && userId
      ? partida.vaga_1?.tecnico?.id === userId
        ? partida.vaga_1?.id
        : partida.vaga_2?.tecnico?.id === userId
          ? partida.vaga_2?.id
          : null
      : null
  const adversario = ehCompetitivo
    ? minhaVagaId
      ? minhaVagaId === l1.ownerId
        ? l2
        : l1
      : null
    : userId && partida.participante_1?.id === userId
      ? l2
      : userId && partida.participante_2?.id === userId
        ? l1
        : null

  const linkConvocacao = adversario
    ? linkWhatsApp(
        adversario.celularConvocacao,
        mensagemPara(adversario.nomeConvocacao)
      )
    : null
  const rotuloChamar = adversario?.nomeConvocacao ?? "adversário"

  const emAndamento = partida.status === "em_andamento"

  return (
    <li>
      <Card className="motion-safe:transition-colors hover:border-primary/40">
        <CardHeader>
          <CardTitle asChild>
            <h2>{tituloPartida}</h2>
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Título do torneio linka para a classificação (entrada do Tier 2). */}
            <Link
              href={`/dashboard/torneios/${partida.tournament.id}`}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {torneio}
            </Link>
            {/* Cápsula de status visual — o texto acessível permanece logo abaixo. */}
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                emAndamento
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              {emAndamento ? (
                <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
              ) : null}
              {LABEL_STATUS[partida.status]}
            </span>
            <span className="sr-only">{` • ${LABEL_STATUS[partida.status]}`}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="flex items-center justify-center gap-4 py-2 sm:gap-6">
          <LadoPlacar lado={p1} placar={partida.placar_1} />
          <span
            className="font-display text-2xl font-medium text-muted-foreground/60 sm:text-3xl"
            aria-hidden="true"
          >
            ×
          </span>
          <LadoPlacar lado={p2} placar={partida.placar_2} />
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
                {`Chamar ${rotuloChamar}`}
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
                variant="secondary"
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

/** Coluna de um lado: escudo (clube ou pessoa), detalhe opcional e placar. */
function LadoPlacar({ lado, placar }: { lado: ParticipantePartida; placar: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <TeamCrest
        nome={lado.clube?.nome ?? lado.nome}
        escudoUrl={lado.clube?.escudoUrl}
        size={36}
      />
      <span
        className="font-display text-4xl font-bold tabular-nums sm:text-5xl"
        aria-hidden="true"
      >
        {placar}
      </span>
      {lado.detalhe ? (
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {lado.detalhe}
        </span>
      ) : null}
    </div>
  )
}
