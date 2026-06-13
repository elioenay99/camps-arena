import {
  Flag,
  History,
  ListOrdered,
  Network,
  Plus,
  Settings2,
  Shield,
  Swords,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { GerarMataMataButton } from "@/features/groups/components/GerarMataMataButton";
import { IniciarGruposPanel } from "@/features/groups/components/IniciarGruposPanel";
import { rotuloGrupo } from "@/features/groups/gerarFaseDeGrupos";
import { AvancarFaseButton } from "@/features/knockout/components/AvancarFaseButton";
import { BracketView } from "@/features/knockout/components/BracketView";
import { IniciarMataMataPanel } from "@/features/knockout/components/IniciarMataMataPanel";
import {
  rodadaBaseDaChave,
  tamanhoChaveDasPartidas,
  totalFases,
} from "@/features/knockout/gerarChaveMataMata";
import { MatchHistoryList } from "@/features/match/components/MatchHistoryList";
import { OpenMatchesList } from "@/features/match/components/OpenMatchesList";
import { ResponderWoButtons } from "@/features/match/components/WoButtons";
import { getSolicitacoesWO } from "@/features/match/data/getSolicitacoesWO";
import { StandingsTable } from "@/features/standings/components/StandingsTable";
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao";
import { FORMATO_META } from "@/features/tournament/formatoMeta";
import { StatusPill } from "@/features/tournament/components/StatusPill";
import { IniciarTorneioPanel } from "@/features/tournament/components/IniciarTorneioPanel";
import { InviteSection } from "@/features/tournament/components/InviteSection";
import { ParticipantsSection } from "@/features/tournament/components/ParticipantsSection";
import { TournamentLifecycleButtons } from "@/features/tournament/components/TournamentLifecycleButtons";
import { VagasSection } from "@/features/tournament/components/VagasSection";
import { getConviteDoTorneio } from "@/features/tournament/data/getConviteDoTorneio";
import { getParticipantesDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio";
import {
  getCodigosDasVagas,
  getVagasDoTorneio,
} from "@/features/tournament/data/getVagasDoTorneio";

// Título por torneio (padrão do app: toda rota tem título específico). O
// fetcher usa React cache() — esta query e a da page são UMA viagem ao banco.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fallback = { title: "Classificação · Goliseu" };
  if (!z.uuid().safeParse(id).success) {
    return fallback;
  }
  const classificacao = await getTournamentClassificacao(id);
  const titulo = classificacao?.torneio.titulo.trim();
  return titulo ? { title: `${titulo} · Goliseu` } : fallback;
}


export default async function TorneioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02 do
  // PostgREST (que cairia no error.tsx como se fosse falha do servidor).
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/torneios/${id}`);
  }

  // Torneio inexistente OU privado de terceiro (RLS): mesma resposta 404 —
  // sem oráculo de existência.
  const classificacao = await getTournamentClassificacao(id);
  if (!classificacao) {
    notFound();
  }

  const {
    torneio,
    linhas,
    partidasEncerradas,
    clubes,
    partidasAbertas,
    rodadaAtiva,
    chave,
    grupos,
  } = classificacao;
  const titulo = torneio.titulo.trim() || "Torneio";
  // Console do dono para PARTIDAS (encerrar/reabrir partida). O botão é UX —
  // a autorização real é a action + RLS + trigger de matches. Torneio
  // encerrado congela o lifecycle das partidas (o destrave é reabrir o
  // TORNEIO, na seção Administração); torneio sem dono (created_by NULL,
  // semeados) não tem console.
  const ehDono = torneio.created_by !== null && torneio.created_by === user.id;
  const podeGerirPartidas = ehDono && torneio.status !== "encerrado";
  // Formato gerado: partidas nascem da geração (sem "Nova partida"); o
  // painel de início só existe no rascunho do dono.
  const ehLiga = torneio.formato === "liga";
  const ehMataMata = torneio.formato === "mata_mata";
  const ehFaseLiga = torneio.formato === "fase_liga";
  const ehGrupos = torneio.formato === "grupos_mata_mata" || ehFaseLiga;
  const ehGerado = ehLiga || ehMataMata || ehGrupos;
  // Grupos: o painel também aparece em ATIVO sem nenhuma partida gerada —
  // estado de RECUPERAÇÃO do fluxo promote-first (crash entre a promoção e o
  // INSERT); a action rebaixa para rascunho e refaz (ver iniciarTorneioGrupos).
  const gruposEmRecuperacao =
    ehGrupos &&
    torneio.status === "ativo" &&
    grupos.length === 0 &&
    chave.length === 0;
  const mostrarIniciar =
    ehDono &&
    ehGerado &&
    (torneio.status === "rascunho" || gruposEmRecuperacao);

  // Barragem 'pares' (Fase 3): a chave é B confrontos 1×1 numa rodada ÚNICA — não
  // há fase a avançar. Como é `mata_mata`, a geometria abaixo (2B participantes)
  // inferiria uma fase 2 espúria; gerá-la corromperia o resultado da barragem.
  // Esconde o "Avançar fase" (a action `avancarFase` é a defesa real).
  const { data: barragemPares } = ehMataMata
    ? await supabase
        .from("league_boundaries")
        .select("id")
        .eq("playoff_tournament_id", id)
        .eq("modo", "barragem_cruzada")
        .eq("playoff_estilo", "pares")
        .limit(1)
        .maybeSingle()
    : { data: null };

  // Avançar fase: dono de formato com chave, ativo, chave gerada e final
  // ainda não criada (a action revalida tudo; o gate aqui é UX). Geometria
  // derivada da PRÓPRIA chave em FASES RELATIVAS (rodada-base ≠ 1 nos
  // formatos de grupos — rodadas contínuas).
  const fasesTotais = chave.length > 0 ? totalFases(tamanhoChaveDasPartidas(chave)) : 0;
  const faseAtual =
    chave.length > 0
      ? Math.max(...chave.map((p) => p.rodada)) - rodadaBaseDaChave(chave) + 1
      : 0;
  const mostrarAvancar =
    podeGerirPartidas &&
    (ehMataMata || ehGrupos) &&
    torneio.status === "ativo" &&
    chave.length > 0 &&
    faseAtual < fasesTotais &&
    barragemPares === null;

  // Gerar mata-mata (formatos de grupos): dono, ativo, grupos gerados e
  // chave ainda não criada. `pendentes` orienta o que falta (gate de UX).
  const jogosDeGrupoPendentes = partidasAbertas.filter(
    (p) => p.grupo !== null
  ).length;
  const mostrarGerarMataMata =
    podeGerirPartidas &&
    ehGrupos &&
    torneio.status === "ativo" &&
    grupos.length > 0 &&
    chave.length === 0;

  // Cabeçalho: ícone+rótulo do formato + chips de opções; pontuação só onde há
  // classificação por pontos (mata-mata puro é eliminatória — 3/1/0 ali é ruído).
  const formatoMeta = FORMATO_META[torneio.formato];
  const temTabela = ehLiga || ehGrupos;

  // Modelo clube-cêntrico: AVULSO lista participantes + convite genérico;
  // COMPETITIVO lista VAGAS (clubes) + códigos POR VAGA. Os códigos são
  // segredo do dono — o gate evita a query inútil (a RLS de slot_invites /
  // tournament_invites é a defesa real); torneio encerrado não exibe convite
  // (beco sem saída).
  const [participantes, codigoConvite, vagas, codigosVagas, solicitacoesWO] =
    await Promise.all([
      ehGerado ? Promise.resolve([]) : getParticipantesDoTorneio(id),
      !ehGerado && podeGerirPartidas ? getConviteDoTorneio(id) : Promise.resolve(null),
      ehGerado ? getVagasDoTorneio(id) : Promise.resolve([]),
      ehGerado && podeGerirPartidas
        ? getCodigosDasVagas(id)
        : Promise.resolve(undefined),
      // Solicitações de W.O. pendentes: a RLS devolve ao DONO (todas do
      // torneio) e ao solicitante (a própria). Só faz sentido em competitivo.
      ehGerado ? getSolicitacoesWO(id) : Promise.resolve([]),
    ]);

  // Painéis de início dos formatos gerados: os LADOS são as vagas (slot ids
  // opacos; clube como rótulo) — as actions validam cabeças/atribuições
  // contra esses mesmos ids.
  const lados = vagas.map((vaga) => ({ id: vaga.id, nome: vaga.clube }));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <formatoMeta.Icon className="size-6" />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">
              {titulo}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={torneio.status} />
              <Chip>{formatoMeta.label}</Chip>
              {torneio.ida_e_volta ? <Chip>ida e volta</Chip> : null}
              {torneio.terceiro_lugar ? <Chip>3º lugar</Chip> : null}
              {temTabela ? (
                <Chip>{`V ${torneio.pontos_vitoria} · E ${torneio.pontos_empate} · D ${torneio.pontos_derrota}`}</Chip>
              ) : null}
            </div>
          </div>
        </div>
        {/* Formato gerado não aceita partida manual: as partidas nascem da
            tabela/chave. */}
        {podeGerirPartidas && !ehGerado ? (
          <Button asChild size="sm" className="shrink-0 rounded-full">
            <Link href={`/dashboard/torneios/${id}/partidas/nova`}>
              <Plus aria-hidden="true" />
              Nova partida
            </Link>
          </Button>
        ) : null}
      </header>

      {mostrarIniciar && ehLiga ? (
        <IniciarTorneioPanel
          tournamentId={id}
          qtdParticipantes={lados.length}
          idaEVolta={torneio.ida_e_volta}
          status={torneio.status}
        />
      ) : null}

      {mostrarIniciar && ehMataMata ? (
        <IniciarMataMataPanel
          tournamentId={id}
          participantes={lados}
          idaEVolta={torneio.ida_e_volta}
          terceiroLugar={torneio.terceiro_lugar}
          status={torneio.status}
        />
      ) : null}

      {mostrarIniciar && ehGrupos ? (
        <IniciarGruposPanel
          tournamentId={id}
          participantes={lados}
          idaEVolta={torneio.ida_e_volta}
          terceiroLugar={torneio.terceiro_lugar}
          faseLiga={ehFaseLiga}
          status={torneio.status}
        />
      ) : null}

      {/* Mata-mata puro: a CHAVE substitui a classificação por pontos (e a
          de clubes) — pontos corridos não significam nada em eliminatória. */}
      {ehMataMata ? (
        <SecaoTorneio
          id="chave-titulo"
          titulo="Chave"
          Icon={Network}
          acao={mostrarAvancar ? <AvancarFaseButton tournamentId={id} /> : undefined}
        >
          {chave.length === 0 ? (
            <EstadoVazioSecao Icon={Network}>
              A chave aparece quando o torneio for iniciado.
            </EstadoVazioSecao>
          ) : (
            <BracketView partidas={chave} terceiroLugar={torneio.terceiro_lugar} />
          )}
        </SecaoTorneio>
      ) : null}

      {/* Formatos de grupos: classificação POR GRUPO (única na fase de
          liga) + a chave quando gerada. */}
      {ehGrupos ? (
        <>
          <SecaoTorneio
            id="grupos-titulo"
            titulo={ehFaseLiga ? "Classificação" : "Fase de grupos"}
            Icon={Users}
          >
            {grupos.length === 0 ? (
              <EstadoVazioSecao Icon={Users}>
                Os grupos aparecem quando o torneio for iniciado.
              </EstadoVazioSecao>
            ) : (
              grupos.map((g) => (
                <div key={g.grupo} className="flex flex-col gap-2">
                  {!ehFaseLiga ? (
                    <h3 className="text-sm font-medium">{rotuloGrupo(g.grupo)}</h3>
                  ) : null}
                  {g.linhas.length === 0 ? (
                    <EstadoVazioSecao Icon={ListOrdered}>
                      A classificação aparece depois da primeira partida
                      encerrada.
                    </EstadoVazioSecao>
                  ) : (
                    <StandingsTable linhas={g.linhas} />
                  )}
                </div>
              ))
            )}
          </SecaoTorneio>

          {grupos.length > 0 ? (
            <SecaoTorneio
              id="chave-grupos-titulo"
              titulo="Mata-mata"
              Icon={Swords}
              acao={mostrarAvancar ? <AvancarFaseButton tournamentId={id} /> : undefined}
            >
              {chave.length === 0 ? (
                mostrarGerarMataMata ? (
                  <GerarMataMataButton
                    tournamentId={id}
                    pendentes={jogosDeGrupoPendentes}
                  />
                ) : (
                  <EstadoVazioSecao Icon={Swords}>
                    O mata-mata aparece quando a fase de grupos terminar.
                  </EstadoVazioSecao>
                )
              ) : (
                <BracketView
                  partidas={chave}
                  terceiroLugar={torneio.terceiro_lugar}
                />
              )}
            </SecaoTorneio>
          ) : null}
        </>
      ) : null}

      {!ehMataMata && !ehGrupos ? (
        <SecaoTorneio id="classificacao-titulo" titulo="Classificação" Icon={ListOrdered}>
          {linhas.length === 0 ? (
            <EstadoVazioSecao Icon={ListOrdered}>
              A classificação aparece depois da primeira partida encerrada.
            </EstadoVazioSecao>
          ) : (
            <StandingsTable linhas={linhas} />
          )}
        </SecaoTorneio>
      ) : null}

      {/* Em aberto: contexto para todos; botão Encerrar só para o dono. */}
      {partidasAbertas.length > 0 ? (
        <SecaoTorneio id="abertas-titulo" titulo="Partidas em aberto" Icon={Swords}>
          <OpenMatchesList
            partidas={partidasAbertas}
            mostrarEncerrar={podeGerirPartidas}
            convocacao={{ userId: user.id, titulo, tournamentId: id }}
            rodadaAtiva={rodadaAtiva}
            tournamentId={id}
          />
        </SecaoTorneio>
      ) : null}

      {/* Solicitações de W.O. pendentes: console do DONO (aceitar/recusar). A
          RLS devolve só ao dono as do torneio; o gate aqui evita exibir o
          console a quem não gere as partidas. */}
      {podeGerirPartidas && solicitacoesWO.length > 0 ? (
        <SecaoTorneio id="wo-titulo" titulo="Solicitações de W.O." Icon={Flag}>
          <ul className="flex list-none flex-col gap-2 p-0">
            {solicitacoesWO.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{s.clubeSolicitante}</span>
                  {s.rodada !== null ? (
                    <span className="text-muted-foreground">{` solicitou W.O. (rodada ${s.rodada})`}</span>
                  ) : (
                    <span className="text-muted-foreground"> solicitou W.O.</span>
                  )}
                </span>
                <ResponderWoButtons requestId={s.id} />
              </li>
            ))}
          </ul>
        </SecaoTorneio>
      ) : null}

      {/* Seção omitida quando vazia: o estado vazio da classificação já
          comunica "nenhuma encerrada" — duas mensagens seriam ruído. */}
      {partidasEncerradas.length > 0 ? (
        <SecaoTorneio id="historico-titulo" titulo="Partidas encerradas" Icon={History}>
          <MatchHistoryList
            partidas={partidasEncerradas}
            mostrarReabrir={podeGerirPartidas}
          />
        </SecaoTorneio>
      ) : null}

      {/* Clube é opcional por partida — seção só com clube pontuado (e fora
          do mata-mata: classificação por pontos não se aplica à chave). */}
      {!ehMataMata && clubes.length > 0 ? (
        <SecaoTorneio id="clubes-titulo" titulo="Clubes" Icon={Shield}>
          <StandingsTable linhas={clubes} rotuloLado="Clube" />
        </SecaoTorneio>
      ) : null}

      {/* Lados do torneio: VAGAS (clubes) no competitivo — convite POR VAGA,
          técnico substituível (o congelamento de lista do mata-mata MORREU:
          a disputa é entre clubes; trocar técnico não toca a chave) —;
          participantes no avulso (fluxo original intocado). */}
      {ehGerado ? (
        <VagasSection
          vagas={vagas}
          userId={user.id}
          ehDono={ehDono}
          tournamentId={id}
          torneioEncerrado={torneio.status === "encerrado"}
          codigos={codigosVagas}
        />
      ) : (
        <>
          <ParticipantsSection
            tournamentId={id}
            participantes={participantes}
            userId={user.id}
            ehDono={ehDono}
            torneioEncerrado={torneio.status === "encerrado"}
          />

          {/* Convite genérico (EXCLUSIVO do avulso): só o dono de torneio
              aberto gerencia (encerrado não aceita entrada — exibir o link
              seria um beco sem saída). */}
          {podeGerirPartidas ? (
            <InviteSection tournamentId={id} code={codigoConvite} />
          ) : null}
        </>
      )}

      {/* Lifecycle do TORNEIO (dono): Encerrar fica FORA do gate
          podeGerirPartidas de propósito — em torneio encerrado, Reabrir é o
          único controle de ADMINISTRAÇÃO visível (a gestão de participantes
          permanece liberada em encerrado, exceto mata-mata com chave). Fim da
          página: ação de consequência ampla, longe dos controles do dia a
          dia. */}
      {ehDono ? (
        <section
          aria-labelledby="lifecycle-titulo"
          className="mt-2 flex flex-col gap-3 border-t pt-6"
        >
          <h2
            id="lifecycle-titulo"
            className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            Administração do torneio
          </h2>
          <div>
            <TournamentLifecycleButtons
              tournamentId={id}
              encerrado={torneio.status === "encerrado"}
              partidasAbertas={partidasAbertas.length}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** Chip de metadado do cabeçalho (formato, opções, pontuação). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

/** Seção da página do torneio: heading com ícone (+ ação opcional) e conteúdo. */
function SecaoTorneio({
  id,
  titulo,
  Icon,
  acao,
  children,
}: {
  id: string;
  titulo: string;
  Icon: typeof ListOrdered;
  acao?: React.ReactNode;
  children: React.ReactNode;
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
  );
}

/** Estado vazio padrão de uma seção: ícone com glow sutil + texto. */
function EstadoVazioSecao({
  Icon,
  children,
}: {
  Icon: typeof ListOrdered;
  children: React.ReactNode;
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
  );
}
