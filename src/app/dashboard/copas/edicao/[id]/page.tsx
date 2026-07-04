import {
  Crown,
  Hammer,
  ListOrdered,
  Network,
  Settings2,
  Trophy,
  Users,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { champThemeProps } from "@/features/championship/championshipTheme"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { CupSeasonStatusPill } from "@/features/cup/components/CupSeasonStatusPill"
import { EdicaoParticipantesPanel } from "@/features/cup/components/EdicaoParticipantesPanel"
import {
  EncerrarEdicaoButton,
  IniciarEdicaoButton,
} from "@/features/cup/components/EdicaoLifecycleButtons"
import { CUP_FORMAT_LABEL } from "@/features/cup/cupLabels"
import { getEdicao, type ParticipanteEdicao } from "@/features/cup/data/getEdicao"
import { rotuloGrupo } from "@/features/groups/gerarFaseDeGrupos"
import { BracketView } from "@/features/knockout/components/BracketView"
import { ClassificacaoResponsiva } from "@/features/standings/components/ClassificacaoResponsiva"
import { StandingsTable } from "@/features/standings/components/StandingsTable"
import {
  getTournamentClassificacao,
  type ClassificacaoTorneio,
} from "@/features/standings/data/getTournamentClassificacao"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const fallback = { title: "Edição da copa · Goliseu" }
  if (!z.uuid().safeParse(id).success) return fallback
  const edicao = await getEdicao(id)
  if (!edicao) return fallback
  return { title: `${edicao.copa.nome.trim() || "Copa"} — Edição ${edicao.numero} · Goliseu` }
}

/** Chip de metadado (espelha a página do torneio). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}

/** Seção da página (heading com ícone + conteúdo) — espelha a do torneio. */
function Secao({
  id,
  titulo,
  Icon,
  acao,
  children,
}: {
  id: string
  titulo: string
  Icon: typeof ListOrdered
  acao?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={id}
          className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
        >
          <Icon className="text-primary size-4.5" aria-hidden="true" />
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

function EstadoVazio({
  Icon,
  children,
}: {
  Icon: typeof ListOrdered
  children: React.ReactNode
}) {
  return (
    <div className="bg-muted/10 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="bg-primary/8 text-primary/70 flex size-11 items-center justify-center rounded-full"
      >
        <Icon className="size-5" />
      </span>
      <p className="text-muted-foreground max-w-xs text-sm">{children}</p>
    </div>
  )
}

/**
 * Visualização do torneio materializado da edição (chave + grupos), REUSANDO os
 * mesmos componentes da página do torneio (BracketView, StandingsTable). A edição
 * materializa um `tournaments` normal — a leitura é a mesma.
 */
function VisualizacaoTorneio({
  dados,
  ehGrupos,
  terceiroLugar,
}: {
  dados: ClassificacaoTorneio
  ehGrupos: boolean
  terceiroLugar: boolean
}) {
  const { chave, grupos } = dados
  // Toggle rolar/caber só quando há ao menos uma tabela de grupo com linhas.
  const temTabelaGrupos = ehGrupos && grupos.some((g) => g.linhas.length > 0)
  const gruposSecao = ehGrupos ? (
    <Secao id="grupos-titulo" titulo="Fase de grupos" Icon={Users}>
      {grupos.length === 0 ? (
        <EstadoVazio Icon={Users}>
          Os grupos aparecem quando a edição for iniciada.
        </EstadoVazio>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <div key={g.grupo} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{rotuloGrupo(g.grupo)}</h3>
              {g.linhas.length === 0 ? (
                <EstadoVazio Icon={ListOrdered}>
                  A classificação aparece depois da primeira partida encerrada.
                </EstadoVazio>
              ) : (
                <StandingsTable linhas={g.linhas} />
              )}
            </div>
          ))}
        </div>
      )}
    </Secao>
  ) : null
  return (
    <>
      {gruposSecao ? (
        temTabelaGrupos ? (
          <ClassificacaoResponsiva>{gruposSecao}</ClassificacaoResponsiva>
        ) : (
          gruposSecao
        )
      ) : null}

      <Secao id="chave-titulo" titulo={ehGrupos ? "Mata-mata" : "Chave"} Icon={Network}>
        {chave.length === 0 ? (
          <EstadoVazio Icon={Network}>
            {ehGrupos
              ? "O mata-mata aparece quando a fase de grupos terminar."
              : "A chave aparece quando a edição for iniciada."}
          </EstadoVazio>
        ) : (
          <BracketView partidas={chave} terceiroLugar={terceiroLugar} />
        )}
      </Secao>
    </>
  )
}

/** Classificação final (edição encerrada): ordena por posicao_final. */
function ClassificacaoFinal({ participantes }: { participantes: ParticipanteEdicao[] }) {
  const ordenados = [...participantes]
    .filter((p) => p.posicaoFinal != null)
    .sort((a, b) => (a.posicaoFinal ?? 0) - (b.posicaoFinal ?? 0))

  if (ordenados.length === 0) {
    return (
      <EstadoVazio Icon={Trophy}>
        A classificação final aparece quando a edição for encerrada.
      </EstadoVazio>
    )
  }

  return (
    <ol className="grid list-none gap-2 p-0">
      {ordenados.map((p) => {
        const campeao = p.posicaoFinal === 1
        return (
          <li
            key={p.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5",
              campeao ? "border-gold/40 bg-gold/10" : "bg-card"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "font-display flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums",
                campeao ? "bg-gold/20 text-gold-ink" : "bg-muted text-muted-foreground"
              )}
            >
              {p.posicaoFinal}
            </span>
            {p.teamId ? (
              <TeamCrest nome={p.nome} escudoUrl={p.escudoUrl} size={22} />
            ) : (
              <span
                aria-hidden="true"
                className="bg-muted text-muted-foreground flex size-[22px] shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold"
              >
                {p.nome.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nome}</span>
            {campeao ? (
              <span className="text-gold-ink inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
                <Crown className="size-3.5" aria-hidden="true" />
                Campeã
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export default async function EdicaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/copas/edicao/${id}`)
  }

  const edicao = await getEdicao(id)
  if (!edicao) {
    notFound()
  }

  const ehDono = edicao.copa.criadaPor !== null && edicao.copa.criadaPor === user.id
  const ehGrupos = edicao.copa.formato === "grupos_mata_mata"

  // Visualização do torneio (ativa/encerrada): reusa o fetcher do torneio. Só
  // carrega quando há torneio materializado.
  const classificacaoTorneio =
    edicao.tournamentId && (edicao.status === "ativa" || edicao.status === "encerrada")
      ? await getTournamentClassificacao(edicao.tournamentId)
      : null

  const titulo = edicao.copa.nome.trim() || "Copa"
  const themeProps = champThemeProps(edicao.copa.corPrimaria, edicao.copa.corSecundaria)

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10",
        themeProps?.className
      )}
      style={themeProps?.style}
    >
      <header className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <ChampionshipBadge
            icon={<Trophy className="size-6" />}
            primary={edicao.copa.corPrimaria}
            secondary={edicao.copa.corSecundaria}
            className="size-12 rounded-xl ring-1 ring-primary/20"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <Link
              href={`/dashboard/copas/${edicao.copa.id}`}
              className="text-muted-foreground hover:text-foreground w-fit text-xs font-medium transition-colors"
            >
              {titulo}
            </Link>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Edição {edicao.numero}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <CupSeasonStatusPill status={edicao.status} />
              <Chip>{CUP_FORMAT_LABEL[edicao.copa.formato]}</Chip>
            </div>
          </div>
        </div>
      </header>

      {/* RASCUNHO: painel de participantes (dono). Não-dono vê aviso. */}
      {edicao.status === "rascunho" ? (
        ehDono ? (
          <Secao id="participantes-titulo" titulo="Participantes" Icon={Users}>
            <EdicaoParticipantesPanel
              cupSeasonId={id}
              formato={edicao.copa.formato}
              porNome={edicao.copa.porNome}
              qtdGrupos={edicao.copa.qtdGrupos}
              classificadosPorGrupo={edicao.copa.classificadosPorGrupo}
              participantes={edicao.participantes}
            />
          </Secao>
        ) : (
          <EstadoVazio Icon={Hammer}>
            Esta edição ainda está em preparação. Volte quando a chave for montada.
          </EstadoVazio>
        )
      ) : null}

      {/* MONTADA: pronta para iniciar (dono). */}
      {edicao.status === "montada" ? (
        <Secao id="iniciar-titulo" titulo="Pronta para iniciar" Icon={Hammer}>
          <div className="bg-card/60 flex flex-col gap-3 rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">
              A chave foi montada com {edicao.participantes.length}{" "}
              {edicao.participantes.length === 1 ? "participante" : "participantes"}.
              {ehDono ? " Inicie para gerar os confrontos e abrir a disputa." : ""}
            </p>
            {ehDono ? <IniciarEdicaoButton cupSeasonId={id} /> : null}
          </div>
        </Secao>
      ) : null}

      {/* ATIVA / ENCERRADA: visualização do torneio (chave + grupos). */}
      {classificacaoTorneio ? (
        <VisualizacaoTorneio
          dados={classificacaoTorneio}
          ehGrupos={ehGrupos}
          terceiroLugar={classificacaoTorneio.torneio.terceiro_lugar}
        />
      ) : null}

      {/* ENCERRADA: classificação final / campeã. */}
      {edicao.status === "encerrada" ? (
        <Secao id="final-titulo" titulo="Classificação final" Icon={Trophy}>
          <ClassificacaoFinal participantes={edicao.participantes} />
        </Secao>
      ) : null}

      {/* Link para o torneio (ativa/encerrada): a gestão de partidas/placar é lá. */}
      {edicao.tournamentId && (edicao.status === "ativa" || edicao.status === "encerrada") ? (
        <div>
          <Link
            href={`/dashboard/torneios/${edicao.tournamentId}`}
            className="text-primary text-sm font-medium underline-offset-2 hover:underline"
          >
            Abrir o torneio da edição (placares, W.O. e gestão) →
          </Link>
        </div>
      ) : null}

      {/* Administração da edição = dono: encerrar (quando ativa). */}
      {ehDono && edicao.status === "ativa" ? (
        <section
          aria-labelledby="admin-titulo"
          className="mt-2 flex flex-col gap-3 border-t pt-6"
        >
          <h2
            id="admin-titulo"
            className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            Administração da edição
          </h2>
          <EncerrarEdicaoButton cupSeasonId={id} />
        </section>
      ) : null}
    </main>
  )
}
