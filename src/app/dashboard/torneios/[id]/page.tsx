import { ListOrdered, Network, Swords, Users } from "lucide-react";
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
import type { TournamentStatus } from "@/lib/supabase/database.types";

// Título por torneio (padrão do app: toda rota tem título específico). O
// fetcher usa React cache() — esta query e a da page são UMA viagem ao banco.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fallback = { title: "Classificação · Arena" };
  if (!z.uuid().safeParse(id).success) {
    return fallback;
  }
  const classificacao = await getTournamentClassificacao(id);
  const titulo = classificacao?.torneio.titulo.trim();
  return titulo ? { title: `${titulo} · Arena` } : fallback;
}

const LABEL_STATUS: Record<TournamentStatus, string> = {
  rascunho: "em rascunho",
  ativo: "ativo",
  encerrado: "encerrado",
};

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
    faseAtual < fasesTotais;

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

  // Rótulo do formato no subtítulo; pontuação só onde há classificação por
  // pontos (mata-mata puro é eliminatória — exibir 3/1/0 ali seria ruído).
  const sufixoOpcoes = `${torneio.ida_e_volta ? " (ida e volta)" : ""}${torneio.terceiro_lugar ? " com 3º lugar" : ""}`;
  const rotuloFormato = ehLiga
    ? `Liga${torneio.ida_e_volta ? " (ida e volta)" : ""}`
    : ehMataMata
      ? `Mata-mata${sufixoOpcoes}`
      : ehFaseLiga
        ? `Fase de liga + mata-mata${sufixoOpcoes}`
        : ehGrupos
          ? `Grupos + mata-mata${sufixoOpcoes}`
          : "Torneio";
  const subtitulo = `${rotuloFormato} ${LABEL_STATUS[torneio.status]}${
    ehMataMata
      ? ""
      : ` • vitória ${torneio.pontos_vitoria} · empate ${torneio.pontos_empate} · derrota ${torneio.pontos_derrota}`
  }`;

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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-muted-foreground text-sm">{subtitulo}</p>
        </div>
        {/* Formato gerado não aceita partida manual: as partidas nascem da
            tabela/chave. */}
        {podeGerirPartidas && !ehGerado ? (
          <Button asChild size="sm">
            <Link href={`/dashboard/torneios/${id}/partidas/nova`}>
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
        />
      ) : null}

      {mostrarIniciar && ehMataMata ? (
        <IniciarMataMataPanel
          tournamentId={id}
          participantes={lados}
          idaEVolta={torneio.ida_e_volta}
          terceiroLugar={torneio.terceiro_lugar}
        />
      ) : null}

      {mostrarIniciar && ehGrupos ? (
        <IniciarGruposPanel
          tournamentId={id}
          participantes={lados}
          idaEVolta={torneio.ida_e_volta}
          terceiroLugar={torneio.terceiro_lugar}
          faseLiga={ehFaseLiga}
        />
      ) : null}

      {/* Mata-mata puro: a CHAVE substitui a classificação por pontos (e a
          de clubes) — pontos corridos não significam nada em eliminatória. */}
      {ehMataMata ? (
        <section aria-labelledby="chave-titulo" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="chave-titulo" className="font-display text-lg font-bold tracking-tight">
              Chave
            </h2>
            {mostrarAvancar ? <AvancarFaseButton tournamentId={id} /> : null}
          </div>
          {chave.length === 0 ? (
            <p className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              <Network className="size-6 opacity-60" aria-hidden="true" />
              A chave aparece quando o torneio for iniciado.
            </p>
          ) : (
            <BracketView partidas={chave} terceiroLugar={torneio.terceiro_lugar} />
          )}
        </section>
      ) : null}

      {/* Formatos de grupos: classificação POR GRUPO (única na fase de
          liga) + a chave quando gerada. */}
      {ehGrupos ? (
        <>
          <section
            aria-labelledby="grupos-titulo"
            className="flex flex-col gap-4"
          >
            <h2 id="grupos-titulo" className="font-display text-lg font-bold tracking-tight">
              {ehFaseLiga ? "Classificação" : "Fase de grupos"}
            </h2>
            {grupos.length === 0 ? (
              <p className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                <Users className="size-6 opacity-60" aria-hidden="true" />
                Os grupos aparecem quando o torneio for iniciado.
              </p>
            ) : (
              grupos.map((g) => (
                <div key={g.grupo} className="flex flex-col gap-2">
                  {!ehFaseLiga ? (
                    <h3 className="text-sm font-medium">{rotuloGrupo(g.grupo)}</h3>
                  ) : null}
                  {g.linhas.length === 0 ? (
                    <p className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                      <ListOrdered className="size-5 opacity-60" aria-hidden="true" />
                      A classificação aparece depois da primeira partida
                      encerrada.
                    </p>
                  ) : (
                    <StandingsTable linhas={g.linhas} />
                  )}
                </div>
              ))
            )}
          </section>

          {grupos.length > 0 ? (
            <section
              aria-labelledby="chave-grupos-titulo"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="chave-grupos-titulo" className="font-display text-lg font-bold tracking-tight">
                  Mata-mata
                </h2>
                {mostrarAvancar ? <AvancarFaseButton tournamentId={id} /> : null}
              </div>
              {chave.length === 0 ? (
                mostrarGerarMataMata ? (
                  <GerarMataMataButton
                    tournamentId={id}
                    pendentes={jogosDeGrupoPendentes}
                  />
                ) : (
                  <p className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                    <Swords className="size-6 opacity-60" aria-hidden="true" />
                    O mata-mata aparece quando a fase de grupos terminar.
                  </p>
                )
              ) : (
                <BracketView
                  partidas={chave}
                  terceiroLugar={torneio.terceiro_lugar}
                />
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {!ehMataMata && !ehGrupos ? (
        <section aria-labelledby="classificacao-titulo" className="flex flex-col gap-4">
          <h2 id="classificacao-titulo" className="font-display text-lg font-bold tracking-tight">
            Classificação
          </h2>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              <ListOrdered className="size-6 opacity-60" aria-hidden="true" />
              A classificação aparece depois da primeira partida encerrada.
            </p>
          ) : (
            <StandingsTable linhas={linhas} />
          )}
        </section>
      ) : null}

      {/* Em aberto: contexto para todos; botão Encerrar só para o dono. */}
      {partidasAbertas.length > 0 ? (
        <section aria-labelledby="abertas-titulo" className="flex flex-col gap-4">
          <h2 id="abertas-titulo" className="font-display text-lg font-bold tracking-tight">
            Partidas em aberto
          </h2>
          <OpenMatchesList
            partidas={partidasAbertas}
            mostrarEncerrar={podeGerirPartidas}
            convocacao={{ userId: user.id, titulo, tournamentId: id }}
            rodadaAtiva={rodadaAtiva}
            tournamentId={id}
          />
        </section>
      ) : null}

      {/* Solicitações de W.O. pendentes: console do DONO (aceitar/recusar). A
          RLS devolve só ao dono as do torneio; o gate aqui evita exibir o
          console a quem não gere as partidas. */}
      {podeGerirPartidas && solicitacoesWO.length > 0 ? (
        <section aria-labelledby="wo-titulo" className="flex flex-col gap-3">
          <h2 id="wo-titulo" className="font-display text-lg font-bold tracking-tight">
            Solicitações de W.O.
          </h2>
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
        </section>
      ) : null}

      {/* Seção omitida quando vazia: o estado vazio da classificação já
          comunica "nenhuma encerrada" — duas mensagens seriam ruído. */}
      {partidasEncerradas.length > 0 ? (
        <section aria-labelledby="historico-titulo" className="flex flex-col gap-4">
          <h2 id="historico-titulo" className="font-display text-lg font-bold tracking-tight">
            Partidas encerradas
          </h2>
          <MatchHistoryList
            partidas={partidasEncerradas}
            mostrarReabrir={podeGerirPartidas}
          />
        </section>
      ) : null}

      {/* Clube é opcional por partida — seção só com clube pontuado (e fora
          do mata-mata: classificação por pontos não se aplica à chave). */}
      {!ehMataMata && clubes.length > 0 ? (
        <section aria-labelledby="clubes-titulo" className="flex flex-col gap-4">
          <h2 id="clubes-titulo" className="font-display text-lg font-bold tracking-tight">
            Clubes
          </h2>
          <StandingsTable linhas={clubes} rotuloLado="Clube" />
        </section>
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
          className="flex flex-col gap-3 border-t pt-6"
        >
          <h2 id="lifecycle-titulo" className="font-display text-sm font-bold tracking-tight">
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
