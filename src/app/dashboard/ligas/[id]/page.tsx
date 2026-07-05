import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ExternalLink, Goal, Layers, Palette, Users } from "lucide-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  champThemeProps,
  resolverCores,
} from "@/features/championship/championshipTheme"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { CompartilharCompetitionButton } from "@/features/discovery/components/CompartilharCompetitionButton"
import { ArtilhariaRanking } from "@/features/league/components/ArtilhariaRanking"
import { getArtilharia } from "@/features/league/data/getArtilharia"
import { ListarVitrineToggle } from "@/features/discovery/components/ListarVitrineToggle"
import { FluxoTemporadaPanel } from "@/features/league/components/FluxoTemporadaPanel"
import { IniciarDivisaoButton } from "@/features/league/components/IniciarDivisaoButton"
import { TurnoDivisaoControl } from "@/features/league/components/TurnoDivisaoControl"
import { MontarTemporadaButton } from "@/features/league/components/MontarTemporadaButton"
import {
  PlayoffsPanel,
  type PlayoffFronteiraView,
} from "@/features/league/components/PlayoffsPanel"
import { SeasonStatusPill } from "@/features/league/components/SeasonStatusPill"
import {
  getDivisionStandings,
  type DivisaoStandings,
} from "@/features/league/data/getDivisionStandings"
import {
  getGrandeFinal,
  type GrandeFinalDivisao,
} from "@/features/league/data/getGrandeFinal"
import { GrandeFinalPanel } from "@/features/league/components/GrandeFinalPanel"
import { getPlayoffs } from "@/features/league/data/getPlayoffs"
import {
  getSeason,
  type DivisaoTemporada,
} from "@/features/league/data/getSeason"
import { BracketView } from "@/features/knockout/components/BracketView"
import { ClassificacaoResponsiva } from "@/features/standings/components/ClassificacaoResponsiva"
import { StandingsTable } from "@/features/standings/components/StandingsTable"
import { DestaquesClassificacao } from "@/features/standings/components/DestaquesClassificacao"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const fallback = { title: "Temporada · Goliseu" }
  if (!z.uuid().safeParse(id).success) {
    return fallback
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return fallback
  }
  const temporada = await getSeason(id, user.id)
  const nome = temporada?.competicao.nome.trim()
  return nome ? { title: `${nome} · Goliseu` } : fallback
}

export default async function TemporadaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02.
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/ligas/${id}`)
  }

  // Temporada inexistente OU invisível ao usuário (RLS): mesma resposta 404 — sem
  // oráculo de existência. A VISIBILIDADE é da RLS (liga `ativa` é pública para
  // logados; `arquivada` só a equipe); a página serve LEITURA a qualquer logado.
  const temporada = await getSeason(id, user.id)
  if (!temporada) {
    notFound()
  }

  // Capacidade GERIR (dono OU admin de liga): separa a LEITURA (todos os logados)
  // dos controles de GESTÃO (add-liga-visao-leitura). Não é mais pré-condição da
  // página — vem como flag do getSeason e gateia cada controle abaixo.
  const podeGerir = temporada.podeGerir

  // `ehDono` = o usuário criou a pirâmide (`league_competitions.created_by`).
  // Separa as ações DONO-only — a virada de temporada (confirmarFluxoTemporada
  // retorna NAO_DONO a admin não-dono). Espelha `podeReabrir={ehDono}`.
  const ehDono =
    temporada.competicao.criadaPor !== null &&
    temporada.competicao.criadaPor === user.id

  // "Não montada" = nenhuma divisão virou torneio ainda (tournament_id null).
  // NÃO usar o status da season: ele continua 'rascunho' DEPOIS de montar (só
  // vira 'ativa' ao iniciar TODAS as divisões), então decidir por ele esconderia
  // o "Iniciar divisão" e prenderia o dono no card de montagem.
  const naoMontada = temporada.divisoes.every((d) => d.tournamentId === null)

  // Classificação de cada divisão (em paralelo). Não montada → sem torneio →
  // standings null, sem tabela.
  const standingsPorDivisao = naoMontada
    ? temporada.divisoes.map(() => null)
    : await Promise.all(
        temporada.divisoes.map((div) =>
          getDivisionStandings(div.id, user.id, temporada.fronteiras)
        )
      )

  // Grande final (Fase 5.1): só nas divisões SPLIT (com Clausura). As demais
  // ficam `null` — o DivisaoCard só renderiza o painel quando não-nulo. Em
  // paralelo com o resto (não bloqueia o render das divisões anuais).
  const grandeFinalPorDivisao = await Promise.all(
    temporada.divisoes.map((div) =>
      div.tournamentIdClausura !== null
        ? getGrandeFinal(div.id, user.id)
        : Promise.resolve<GrandeFinalDivisao | null>(null)
    )
  )

  // Ranking de artilharia da PIRÂMIDE (change add-artilharia): agrega os gols de
  // TODOS os torneios da temporada (as divisões — Apertura + Clausura no split).
  // getArtilharia respeita a RLS (gols de rodada oculta não entram). Vazia
  // enquanto nenhum autor foi informado ou nada foi montado.
  const tournamentIdsTemporada = temporada.divisoes.flatMap((d) =>
    [d.tournamentId, d.tournamentIdClausura].filter(
      (t): t is string => t !== null
    )
  )
  const artilharia =
    tournamentIdsTemporada.length > 0
      ? await getArtilharia(supabase, { tournamentIds: tournamentIdsTemporada })
      : []

  // Mapa nível → nome (para o FluxoTemporadaPanel rotular as divisões).
  const nivelNomes: Record<number, string> = {}
  for (const div of temporada.divisoes) nivelNomes[div.nivel] = div.nome

  // Fim de temporada: ATIVA com todas as divisões já encerradas → habilita a
  // sequência de fim de temporada (playoffs → fluxo). NÃO usa `status` (só da
  // Apertura): no split a Apertura pode estar 'encerrado' enquanto a Clausura
  // ainda joga — só `encerradaParaFluxo` (ambas as meias) libera o fluxo.
  const todasEncerradas =
    temporada.status === "ativa" &&
    standingsPorDivisao.length > 0 &&
    standingsPorDivisao.every((s) => s?.encerradaParaFluxo)

  // PLAYOFFS (Fase 2): só relevante quando as divisões já encerraram. A SEQUÊNCIA
  // nova é: divisões encerram → MONTAR playoffs → jogar/encerrar as chaves →
  // calcular fluxo. `resolvidos` = toda fronteira de playoff tem chave decidida;
  // até lá o painel de fluxo fica BLOQUEADO (o sobe/cai depende da chave).
  const playoffs = todasEncerradas
    ? await getPlayoffs(temporada.seasonId, user.id)
    : null

  // 'em_fluxo' = a confirmação começou mas não concluiu (falha parcial entre
  // 'em_fluxo' e 'encerrada'). O painel reaparece para RETOMAR — confirmar é
  // idempotente (recalcula com a mesma semente = id da temporada). Sem isto o
  // dono ficaria num beco sem saída (vê os torneios encerrados, sem console).
  const emRetomada = temporada.status === "em_fluxo"

  // Há playoff pendente quando todas as divisões encerraram, existem fronteiras
  // não-'direto' e nem todas as chaves resolveram. Nesse caso o fluxo fica
  // escondido e a seção de playoffs aparece no lugar.
  const playoffPendente =
    todasEncerradas && (playoffs?.temPlayoffs ?? false) && !playoffs?.resolvidos

  // O fluxo de sobe/cai só abre quando: (a) todas encerraram E (não há playoff OU
  // os playoffs resolveram), ou (b) a temporada está em retomada (em_fluxo).
  const mostrarFluxo =
    (todasEncerradas && !playoffPendente) || emRetomada

  // Toggle rolar/caber (mobile): um só controla TODAS as divisões. Só aparece
  // quando ao menos uma divisão já tem tabela (não-rascunho).
  const temTabelaDivisoes = standingsPorDivisao.some(
    (s) => s !== null && s.status !== "rascunho"
  )
  const secaoDivisoes = (
    <section aria-label="Divisões" className="flex flex-col gap-5">
      {temporada.divisoes.map((div, i) => (
        <DivisaoCard
          key={div.id}
          divisao={div}
          standings={standingsPorDivisao[i]}
          grandeFinal={grandeFinalPorDivisao[i]}
          seasonId={temporada.seasonId}
          corCompeticao={{
            cor_primaria: temporada.competicao.corPrimaria,
            cor_secundaria: temporada.competicao.corSecundaria,
          }}
          ordem={i}
          podeGerir={podeGerir}
        />
      ))}
    </section>
  )

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {/* Identidade da PIRÂMIDE (change add-cores-campeonato): cor DEFAULT da
              competição (ou selo neutro se null). */}
          <ChampionshipBadge
            icon={<Layers className="size-6" />}
            primary={temporada.competicao.corPrimaria}
            secondary={temporada.competicao.corSecundaria}
            className="size-12 rounded-xl ring-1 ring-primary/20"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">
              {temporada.competicao.nome.trim() || "Pirâmide"}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <SeasonStatusPill status={temporada.status} />
              <Chip>{`Temporada ${temporada.numero}`}</Chip>
              <Chip>
                {temporada.divisoes.length === 1
                  ? "1 divisão"
                  : `${temporada.divisoes.length} divisões`}
              </Chip>
            </div>
          </div>
        </div>
        {/* Controles de gestão (Equipe, Identidade) só para quem tem capacidade
            GERIR. O leitor não os vê — e as próprias páginas /equipe e /cores
            fazem `!podeGerir → notFound` (defesa em profundidade). */}
        {podeGerir ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-muted-foreground rounded-full"
            >
              {/* Sem prefetch nos botões de gestão (Equipe/Identidade): rotas RSC
                  que somariam à rajada do header/listas — a borda da Vercel
                  descarta o excesso (503). O clique navega. Ver change
                  add-header-prefetch-hardening. */}
              <Link href={`/dashboard/ligas/${id}/equipe`} prefetch={false}>
                <Users aria-hidden="true" />
                Equipe
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="text-muted-foreground rounded-full"
            >
              <Link href={`/dashboard/ligas/${id}/cores`} prefetch={false}>
                <Palette aria-hidden="true" />
                Identidade
              </Link>
            </Button>
            <CompartilharCompetitionButton
              path={`/dashboard/ligas/${id}`}
              titulo={temporada.competicao.nome.trim() || "Pirâmide"}
            />
          </div>
        ) : null}
      </header>

      {/* Vitrine pública (add-vitrine-publica-e-compartilhar): toggle de listagem
          da pirâmide, só para quem gere. A flag é da COMPETIÇÃO-mãe. */}
      {podeGerir ? (
        <ListarVitrineToggle
          tipo="liga"
          competitionId={temporada.competicao.id}
          seasonId={temporada.seasonId}
          listada={temporada.competicao.listada}
        />
      ) : null}

      {/* Não montada: a temporada existe mas as divisões ainda não viraram
          torneios. Monte para criar os torneios e as vagas. */}
      {naoMontada ? (
        <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="glow-primary flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
          >
            <Layers className="size-6" />
          </span>
          {/* Gestor: chamada para montar + botão. Leitor (edge — a temporada em
              rascunho tende a ser escondida pela RLS antes daqui): estado
              informativo read-only, sem botão. */}
          {podeGerir ? (
            <>
              <div className="flex max-w-sm flex-col gap-1.5">
                <h2 className="font-display text-lg font-bold">
                  Monte a temporada
                </h2>
                <p className="text-muted-foreground text-sm">
                  Cada divisão vira um torneio de liga com as vagas dos
                  competidores. Depois, inicie cada divisão para gerar a tabela.
                </p>
              </div>
              <MontarTemporadaButton seasonId={temporada.seasonId} />
            </>
          ) : (
            <div className="flex max-w-sm flex-col gap-1.5">
              <h2 className="font-display text-lg font-bold">
                Temporada ainda não montada
              </h2>
              <p className="text-muted-foreground text-sm">
                As divisões desta temporada ainda não foram montadas. A
                classificação aparecerá quando a temporada começar.
              </p>
            </div>
          )}
        </Card>
      ) : temTabelaDivisoes ? (
        <ClassificacaoResponsiva>{secaoDivisoes}</ClassificacaoResponsiva>
      ) : (
        secaoDivisoes
      )}

      {/* Artilheiros da pirâmide (change add-artilharia): leitura para todos.
          Só quando a temporada foi montada (há torneios a agregar). */}
      {!naoMontada ? (
        <section
          aria-labelledby="artilheiros-titulo"
          className="flex flex-col gap-4 border-t pt-6"
        >
          <h2
            id="artilheiros-titulo"
            className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <Goal className="text-primary size-5" aria-hidden="true" />
            Artilheiros
          </h2>
          <ArtilhariaRanking linhas={artilharia} />
        </section>
      ) : null}

      {/* Playoffs (Fase 2): entre as Divisões e o Fim-de-temporada. Aparece
          quando todas as divisões encerraram e há fronteira de playoff ainda
          não resolvida. A page (server) renderiza o BracketView; o painel
          (client) cuida só dos botões (montar / avançar fase). */}
      {/* Seção só aparece quando há algo a mostrar: para o LEITOR, apenas se
          alguma chave já foi montada (o card "Montar playoffs" é gestão-only e o
          PlayoffsPanel retorna null sem chaves). Para o gestor, sempre que
          pendente. */}
      {playoffPendente && playoffs && (podeGerir || playoffs.algumaMontada) ? (
        <section
          aria-labelledby="playoffs-titulo"
          className="flex flex-col gap-4 border-t pt-6"
        >
          <h2
            id="playoffs-titulo"
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Playoffs
          </h2>
          <PlayoffsPanel
            seasonId={temporada.seasonId}
            nivelNomes={nivelNomes}
            podeGerir={podeGerir}
            fronteiras={playoffs.fronteiras.map(
              (f): PlayoffFronteiraView => ({
                nivelSuperior: f.nivelSuperior,
                modo: f.modo,
                estilo: f.estilo,
                playoffVagas: f.playoffVagas,
                vagasAcesso: f.vagasAcesso,
                vagasRebaixamento: f.vagasRebaixamento,
                playoffTournamentId: f.playoffTournamentId,
                torneioStatus: f.torneioStatus,
                decidida: f.decidida,
                totalPartidas: f.partidas.length,
                bracket:
                  f.partidas.length > 0 ? (
                    <BracketView partidas={f.partidas} />
                  ) : null,
              })
            )}
          />
        </section>
      ) : null}

      {/* Fim de temporada: todas as divisões encerradas (ou retomada de um
          fluxo interrompido) → sobe e cai. Console de GESTÃO (calcular/confirmar
          o sobe-cai) — oculto para o leitor; o sobe/cai visual já aparece nas
          zonas das tabelas de cada divisão. */}
      {mostrarFluxo && podeGerir ? (
        <section
          aria-labelledby="fluxo-titulo"
          className="flex flex-col gap-4 border-t pt-6"
        >
          <h2
            id="fluxo-titulo"
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            Fim de temporada
          </h2>
          {emRetomada ? (
            <p
              role="status"
              className="border-accent/30 bg-accent/10 text-accent-foreground rounded-lg border px-3 py-2 text-sm"
            >
              O fluxo desta temporada começou mas não foi concluído. Calcule e
              confirme novamente para gerar a próxima temporada — nada é refeito
              em dobro.
            </p>
          ) : null}
          <FluxoTemporadaPanel
            seasonId={temporada.seasonId}
            competidores={temporada.competidores}
            nivelNomes={nivelNomes}
            ehDono={ehDono}
          />
        </section>
      ) : null}
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                             */
/* -------------------------------------------------------------------------- */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}

/** Um nível da pirâmide: cabeçalho + tabela (com zonas) ou estado de início. */
function DivisaoCard({
  divisao,
  standings,
  grandeFinal,
  seasonId,
  corCompeticao,
  ordem,
  podeGerir,
}: {
  divisao: DivisaoTemporada
  standings: DivisaoStandings | null
  /** Grande final desta divisão (Fase 5.1) — `null` fora do split. */
  grandeFinal: GrandeFinalDivisao | null
  /** Id da temporada — repassado ao painel da grande final (action recebe seasonId). */
  seasonId: string
  /** Cor DEFAULT da competição (fallback de herança da divisão sem cor própria). */
  corCompeticao: { cor_primaria: string | null; cor_secundaria: string | null }
  ordem: number
  /** Capacidade GERIR: oculta os controles de gestão (iniciar/turno/montar final)
   * ao leitor, preservando a leitura (classificação, bracket). */
  podeGerir: boolean
}) {
  // Sem torneio (não montada) — não deveria ocorrer fora do rascunho, mas é
  // defesa. Montada mas não iniciada (rascunho do torneio): botão de iniciar.
  // No split, `status` é só da APERTURA — e o backend inicia AS DUAS meias num
  // clique, então o gate de "não iniciada" continua sendo o status da Apertura.
  const naoIniciada =
    divisao.tournamentId !== null &&
    (standings === null || standings.status === "rascunho")

  // Divisão SPLIT (Apertura + Clausura): a divisão roda dois turnos e a tabela é
  // a ANUAL COMBINADA (não coroa líder — o título sai da grande final).
  const ehSplit = divisao.tournamentIdClausura !== null

  // Identidade da divisão (change add-cores-campeonato): cor PRÓPRIA ?? cor da
  // competição ?? base. `resolverCores` opera em snake_case — converte aqui.
  const { primaria, secundaria } = resolverCores(
    { cor_primaria: divisao.corPrimaria, cor_secundaria: divisao.corSecundaria },
    corCompeticao
  )
  const themeProps = champThemeProps(primaria, secundaria)
  const staggerStyle = {
    "--stagger": `${ordem * 60}ms`,
  } as React.CSSProperties

  return (
    <section
      aria-labelledby={`div-${divisao.id}`}
      className={cn("animate-rise flex flex-col gap-3", themeProps?.className)}
      style={{ ...staggerStyle, ...themeProps?.style }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id={`div-${divisao.id}`}
          className="font-display flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight"
        >
          <ChampionshipBadge
            icon={
              <span className="text-sm font-bold tabular-nums">
                {divisao.nivel}
              </span>
            }
            primary={primaria}
            secondary={secundaria}
            className="size-6 shrink-0 rounded-md"
          />
          <span className="min-w-0 break-words">
            {divisao.nome.trim() || `Divisão ${divisao.nivel}`}
          </span>
        </h2>
        {/* Split: DOIS links (lançar placares de cada turno). Anual: um só. */}
        {divisao.tournamentId ? (
          ehSplit ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground rounded-full"
              >
                {/* Sem prefetch: a página lista N divisões, cada uma com link(s)
                    de torneio (rotas RSC caras); os prefetches em massa
                    estouravam a borda da Vercel (503). Ver
                    add-dashboard-prefetch-hardening. */}
                <Link
                  href={`/dashboard/torneios/${divisao.tournamentId}`}
                  prefetch={false}
                >
                  <ExternalLink aria-hidden="true" />
                  Abrir Apertura
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground rounded-full"
              >
                <Link
                  href={`/dashboard/torneios/${divisao.tournamentIdClausura}`}
                  prefetch={false}
                >
                  <ExternalLink aria-hidden="true" />
                  Abrir Clausura
                </Link>
              </Button>
            </div>
          ) : (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-muted-foreground rounded-full"
            >
              <Link
                href={`/dashboard/torneios/${divisao.tournamentId}`}
                prefetch={false}
              >
                <ExternalLink aria-hidden="true" />
                Abrir torneio
              </Link>
            </Button>
          )
        ) : null}
      </div>

      {standings && standings.status !== "rascunho" ? (
        <>
          <StandingsTable
            linhas={standings.linhas}
            rotuloLado={divisao.porNome ? "Competidor" : "Clube"}
            zonas={standings.zonas}
            promedioPorParticipante={standings.promedios}
            formaPorParticipante={standings.insights?.formaPorParticipante}
            hrefCompetidorBase="/dashboard/ligas/competidor"
            ocultarCampeao={ehSplit}
          />
          {/* Destaques (change add-insights-classificacao): só quando há insights
              (null no ciclo split, fora do MVP). */}
          {standings.insights ? (
            <DestaquesClassificacao
              destaques={standings.insights.destaques}
              nomePorId={
                new Map(standings.linhas.map((l) => [l.participanteId, l.nome]))
              }
            />
          ) : null}
          {/* Grande final: só no split, com o estado já resolvido no servidor.
              `podeGerir` esconde o botão "Montar" ao leitor (bracket preservado). */}
          {ehSplit && grandeFinal ? (
            <GrandeFinalPanel
              divisionSeasonId={divisao.id}
              seasonId={seasonId}
              grandeFinal={grandeFinal}
              bracket={
                grandeFinal.partidas.length > 0 ? (
                  <BracketView partidas={grandeFinal.partidas} />
                ) : null
              }
              podeGerir={podeGerir}
            />
          ) : null}
        </>
      ) : (
        <Card className="elevate" size="sm">
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-muted-foreground max-w-xs text-sm">
              {naoIniciada
                ? podeGerir
                  ? "Divisão montada. Inicie para gerar a tabela e abrir as partidas."
                  : "A classificação aparecerá quando a divisão começar."
                : "Divisão ainda não montada."}
            </p>
            {/* Controles de gestão (turno + iniciar) só para quem gere — ocultos
                ao leitor, que vê apenas o estado informativo acima. */}
            {naoIniciada && podeGerir ? (
              <div className="flex flex-col items-center gap-3">
                {/* Turno só é editável em LIGA e antes de iniciar (a tabela é
                    gerada com o turno escolhido). Em grupos não se aplica. */}
                {divisao.formato === "liga" ? (
                  <TurnoDivisaoControl
                    divisionSeasonId={divisao.id}
                    seasonId={seasonId}
                    tamanho={divisao.tamanho}
                    idaEVolta={divisao.idaEVolta}
                    disabled={divisao.iniciada}
                  />
                ) : null}
                <IniciarDivisaoButton divisionSeasonId={divisao.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
