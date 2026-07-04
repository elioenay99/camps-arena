import {
  CalendarClock,
  ClipboardCheck,
  Flag,
  History,
  Layers,
  ListOrdered,
  Lock,
  Network,
  Palette,
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

import { podeArbitrar, podeGerir, podeModerar } from "@/lib/autorizacao";
import { carregarCelulares } from "@/lib/contatos";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { mensagemListaTimes, mensagemRodada } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { champThemeProps } from "@/features/championship/championshipTheme";
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge";
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
import { CompartilharRodadaButton } from "@/features/match/components/CompartilharRodadaButton";
import { CompartilharCompetitionButton } from "@/features/discovery/components/CompartilharCompetitionButton";
import { ListarVitrineToggle } from "@/features/discovery/components/ListarVitrineToggle";
import { LiberarRodadasButtons } from "@/features/match/components/LiberarRodadasButtons";
import { confrontosTextoDaRodada } from "@/features/match/confrontosTextoDaRodada";
import { MatchHistoryList } from "@/features/match/components/MatchHistoryList";
import { OpenMatchesList } from "@/features/match/components/OpenMatchesList";
import { PropostasPendentes } from "@/features/match/components/PropostasPendentes";
import { ResponderWoButtons } from "@/features/match/components/WoButtons";
import { getPropostasPendentes } from "@/features/match/data/getPropostasPendentes";
import { getSolicitacoesWO } from "@/features/match/data/getSolicitacoesWO";
import { ClassificacaoResponsiva } from "@/features/standings/components/ClassificacaoResponsiva";
import { StandingsTable } from "@/features/standings/components/StandingsTable";
import {
  getTournamentClassificacao,
  resolverCoresTorneio,
} from "@/features/standings/data/getTournamentClassificacao";
import { FORMATO_META } from "@/features/tournament/formatoMeta";
import { StatusPill } from "@/features/tournament/components/StatusPill";
import { IniciarTorneioPanel } from "@/features/tournament/components/IniciarTorneioPanel";
import { InviteSection } from "@/features/tournament/components/InviteSection";
import { ParticipantsSection } from "@/features/tournament/components/ParticipantsSection";
import { TournamentLifecycleButtons } from "@/features/tournament/components/TournamentLifecycleButtons";
import {
  TournamentTabs,
  type AbaTorneio,
} from "@/features/tournament/components/TournamentTabs";
import { VagasSection } from "@/features/tournament/components/VagasSection";
import { listaTimesTexto } from "@/features/tournament/listaTimesTexto";
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
    rodadasLiberacao,
    proximaRodadaOculta,
  } = classificacao;
  const titulo = torneio.titulo.trim() || "Torneio";

  // Capacidades da EQUIPE (change add-equipe-campeonato): derivadas de uma vez
  // (1 hop cada, em paralelo) da fonte única no banco. `gerir` (estrutura/ciclo:
  // dono ou admin), `arbitrar` (placar/W.O./rodadas: + árbitro), `moderar`
  // (convites/vagas/participantes: + moderador). O botão é UX — a autorização
  // real é a action + RLS. A herança de divisão de liga já vem resolvida no banco.
  const [gerir, arbitrar, moderar] = await Promise.all([
    podeGerir(supabase, { tournamentId: id }),
    podeArbitrar(supabase, { tournamentId: id }),
    podeModerar(supabase, { tournamentId: id }),
  ]);

  // Torneio de DIVISÃO (change add-equipe-campeonato): quando o torneio É uma
  // divisão de uma pirâmide, a equipe é a da LIGA-mãe (superfície única) — não há
  // equipe própria a gerir aqui. `liga_do_torneio` devolve a competição-mãe (uuid)
  // ou null para torneio avulso. Não-nulo ⇒ esconde o link "Equipe" (a gestão é
  // pela liga); a tela de equipe da divisão também retorna 404 (defesa em prof.).
  const { data: ligaDoTorneio } = await supabase.rpc("liga_do_torneio", {
    p_tid: id,
  });
  const ehDivisao = ligaDoTorneio !== null;

  // Navegação divisão → liga (add-liga-visao-leitura): resolve a TEMPORADA
  // (season) a que esta divisão pertence — a rota da liga é `[season_id]`, não a
  // competição. Cobre Apertura E Clausura (a mesma divisão aponta os dois
  // torneios). A RLS libera esta linha quando a liga é visível; ausente → sem
  // link. Só quando é divisão (torneio avulso não tem liga-mãe).
  let ligaSeasonId: string | null = null;
  if (ehDivisao) {
    const { data: divRow } = await supabase
      .from("league_division_seasons")
      .select("season_id")
      .or(`tournament_id.eq.${id},tournament_id_clausura.eq.${id}`)
      .maybeSingle();
    ligaSeasonId = divRow?.season_id ?? null;
  }

  // `ehDono` permanece SÓ para usos NÃO-autorizativos: (a) data-visibility ligada
  // à RLS (que ainda chaveia por created_by — só o DONO recebe as rodadas ainda
  // não liberadas, então os painéis "tudo liberado/iniciar" seguem o dono, não a
  // capacidade); (b) ações exclusivas do dono (Reabrir torneio). Torneio sem dono
  // (created_by NULL, semeados) não tem console de dono.
  const ehDono = torneio.created_by !== null && torneio.created_by === user.id;
  // Lifecycle das PARTIDAS (encerrar/reabrir partida) e edição de placar/W.O. são
  // capacidade ARBITRAR; torneio encerrado congela o lifecycle (o destrave é
  // reabrir o TORNEIO, na seção Administração).
  const podeArbitrarPartidas = arbitrar && torneio.status !== "encerrado";
  // Formato gerado: partidas nascem da geração (sem "Nova partida"); o
  // painel de início só existe no rascunho do dono.
  const ehLiga = torneio.formato === "liga";
  const ehMataMata = torneio.formato === "mata_mata";
  const ehFaseLiga = torneio.formato === "fase_liga";
  const ehGrupos = torneio.formato === "grupos_mata_mata" || ehFaseLiga;
  const ehGerado = ehLiga || ehMataMata || ehGrupos;
  // Cadência manual (change add-liberacao-rodadas): num torneio ATIVO sem nada
  // liberado, o NÃO-DONO não enxerga partida/classificação/chave nenhuma. Sem
  // este aviso, a página cairia nos empty-states de "não iniciado" — que
  // MENTIRIAM ("aparece quando o torneio for iniciado"): o torneio JÁ está
  // ativo, só faltam rodadas liberadas. O dono nunca cai aqui (recebe tudo,
  // inclusive ocultas). Liberação PARCIAL (há algo visível) não dispara.
  const nadaVisivel =
    !ehDono &&
    partidasAbertas.length === 0 &&
    partidasEncerradas.length === 0 &&
    linhas.length === 0 &&
    grupos.length === 0 &&
    chave.length === 0;
  // `ehGerado` é essencial: só formatos com rodadas têm cadência a liberar. Um
  // torneio AVULSO nasce 'ativo' e fica vazio até o dono criar partidas — sem
  // este gate, o não-dono veria "rodadas não liberadas" num formato sem rodadas.
  const aguardandoLiberacao =
    nadaVisivel && ehGerado && torneio.status === "ativo";
  // Grupos: o painel também aparece em ATIVO sem nenhuma partida gerada —
  // estado de RECUPERAÇÃO do fluxo promote-first (crash entre a promoção e o
  // INSERT); a action rebaixa para rascunho e refaz (ver iniciarTorneioGrupos).
  const gruposEmRecuperacao =
    ehGrupos &&
    torneio.status === "ativo" &&
    grupos.length === 0 &&
    chave.length === 0;
  // Iniciar torneio (estrutural) = capacidade GERIR. O rascunho/recuperação só
  // chega aqui via RLS (chaveada por created_by) — na prática o dono; um admin
  // sem posse de RLS não veria o estado, mas o gate de UX correto é `gerir`.
  const mostrarIniciar =
    gerir &&
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

  // Avançar fase (estrutural) = capacidade GERIR. Formato com chave, ativo,
  // chave gerada e final ainda não criada (a action revalida tudo; o gate aqui é
  // UX). Geometria derivada da PRÓPRIA chave em FASES RELATIVAS (rodada-base ≠ 1
  // nos formatos de grupos — rodadas contínuas).
  const fasesTotais = chave.length > 0 ? totalFases(tamanhoChaveDasPartidas(chave)) : 0;
  const faseAtual =
    chave.length > 0
      ? Math.max(...chave.map((p) => p.rodada)) - rodadaBaseDaChave(chave) + 1
      : 0;
  const mostrarAvancar =
    gerir &&
    (ehMataMata || ehGrupos) &&
    torneio.status === "ativo" &&
    chave.length > 0 &&
    faseAtual < fasesTotais &&
    barragemPares === null;

  // Gerar mata-mata (estrutural, formatos de grupos) = capacidade GERIR: ativo,
  // grupos gerados e chave ainda não criada. `pendentes` orienta o que falta.
  const jogosDeGrupoPendentes = partidasAbertas.filter(
    (p) => p.grupo !== null
  ).length;
  const mostrarGerarMataMata =
    gerir &&
    ehGrupos &&
    torneio.status === "ativo" &&
    grupos.length > 0 &&
    chave.length === 0;

  // Cabeçalho: ícone+rótulo do formato + chips de opções; pontuação só onde há
  // classificação por pontos (mata-mata puro é eliminatória — 3/1/0 ali é ruído).
  const formatoMeta = FORMATO_META[torneio.formato];
  const temTabela = ehLiga || ehGrupos;

  // Convites/vagas/participantes = capacidade MODERAR (+ torneio não-encerrado:
  // encerrado é beco sem saída para entrada). Os códigos de convite são segredo
  // de gestão — o gate evita a query inútil (a RLS de slot_invites /
  // tournament_invites é a defesa real).
  const podeModerarParticipacao = moderar && torneio.status !== "encerrado";

  // Modelo clube-cêntrico: AVULSO lista participantes + convite genérico;
  // COMPETITIVO lista VAGAS (clubes) + códigos POR VAGA.
  const [
    participantes,
    codigoConvite,
    vagas,
    codigosVagas,
    solicitacoesWO,
    propostasPendentes,
  ] = await Promise.all([
    ehGerado ? Promise.resolve([]) : getParticipantesDoTorneio(id),
    !ehGerado && podeModerarParticipacao
      ? getConviteDoTorneio(id)
      : Promise.resolve(null),
    ehGerado ? getVagasDoTorneio(id) : Promise.resolve([]),
    ehGerado && podeModerarParticipacao
      ? getCodigosDasVagas(id)
      : Promise.resolve(undefined),
    // Solicitações de W.O. pendentes: a RLS devolve ao DONO (todas do
    // torneio) e ao solicitante (a própria). Só faz sentido em competitivo.
    ehGerado ? getSolicitacoesWO(id) : Promise.resolve([]),
    // Propostas de placar pendentes (change add-proposta-resultado-foto): o
    // técnico de vaga propõe placar + foto; o aprovador (ARBITRAR) decide. A
    // RLS só entrega ao aprovador (ou jogador) — só faz sentido em competitivo.
    ehGerado ? getPropostasPendentes(supabase, id) : Promise.resolve([]),
  ]);

  // Painéis de início dos formatos gerados: os LADOS são as vagas (slot ids
  // opacos; clube como rótulo) — as actions validam cabeças/atribuições
  // contra esses mesmos ids.
  const lados = vagas.map((vaga) => ({ id: vaga.id, nome: vaga.clube }));

  // Compartilhar a LISTA DE TIMES no WhatsApp (change add-compartilhar-lista-times): só p/
  // quem MODERA, em competitivo com vagas. O texto é montado AQUI (RSC) e passado pronto à
  // VagasSection. O celular dos técnicos vem da RPC gated `carregarCelulares` — PII só
  // embutida no `wa.me`, nunca crua no client; some p/ quem não é co-participante (o dono é
  // co-participante de todo técnico via created_by). O await da RPC só roda quando o botão
  // será exibido (não puxa PII à toa em torneio sem vagas / p/ quem não modera).
  const compartilharTimes =
    ehGerado && moderar && vagas.length > 0
      ? {
          titulo,
          texto: mensagemListaTimes({
            titulo,
            times: listaTimesTexto(
              vagas,
              await carregarCelulares(
                supabase,
                vagas.flatMap((vaga) => (vaga.tecnico ? [vaga.tecnico.id] : []))
              )
            ),
            tournamentId: id,
          }),
        }
      : undefined;

  // Identidade visual (change add-cores-campeonato): cor EFETIVA com fallback de
  // divisão (torneio que É uma divisão de pirâmide herda a cor da liga). 1 query
  // extra só quando o torneio não tem cor própria. `null/null` ⇒ tema base.
  const { primaria, secundaria } = await resolverCoresTorneio(
    supabase,
    id,
    torneio
  );
  const themeProps = champThemeProps(primaria, secundaria);

  // ----------------------------------------------------------------------------
  // Composição das ABAS (change add-torneio-abas-passador). Os dados e TODOS os
  // gates já estão resolvidos acima — aqui só montamos os NÓS por aba. As abas
  // são DINÂMICAS (só entra a que tem conteúdo). O cabeçalho, os painéis de
  // início e a Administração ficam FORA das abas. O `TournamentTabs` e o
  // `RoundPager` apenas apresentam: nenhum dado cru / nenhuma PII cruza para o
  // client (o `wa.me` é montado no servidor, com o celular embutido no link).
  // ----------------------------------------------------------------------------

  // ABA "Classificação" (padrão, sempre presente): chave / grupos / pontos /
  // clubes — ou o aviso de cadência manual ao não-dono.
  const classificacaoInner = (
    <>
      {aguardandoLiberacao ? <AvisoAguardandoLiberacao /> : null}

      {!aguardandoLiberacao && ehMataMata ? (
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

      {!aguardandoLiberacao && ehGrupos ? (
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

      {!aguardandoLiberacao && !ehMataMata && !ehGrupos ? (
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

      {/* Clube é opcional por partida — seção só com clube pontuado (e fora
          do mata-mata: classificação por pontos não se aplica à chave). */}
      {!ehMataMata && clubes.length > 0 ? (
        <SecaoTorneio id="clubes-titulo" titulo="Clubes" Icon={Shield}>
          <StandingsTable linhas={clubes} rotuloLado="Clube" />
        </SecaoTorneio>
      ) : null}
    </>
  );

  // Só há StandingsTable (e, portanto, cabe o toggle rolar/caber) quando há
  // grupos com linhas, classificação geral (torneio não-mata-mata) ou clubes.
  // Mata-mata puro (só bracket) e estados vazios/aguardando ficam CRUS.
  const temTabelaClassificacao =
    !aguardandoLiberacao &&
    ((ehGrupos && grupos.some((g) => g.linhas.length > 0)) ||
      (!ehMataMata && !ehGrupos && linhas.length > 0) ||
      (!ehMataMata && clubes.length > 0));
  const classificacaoContent = temTabelaClassificacao ? (
    <ClassificacaoResponsiva>{classificacaoInner}</ClassificacaoResponsiva>
  ) : (
    classificacaoInner
  );

  // ABA "Partidas": consoles de ação (pendentes/W.O.) no topo + listas paginadas
  // por rodada (passador). O badge conta os itens que pedem ação de quem arbitra,
  // para serem descobertos mesmo com a aba Classificação por padrão (deep-link
  // de push cai na URL nua).
  const pendentesArbitragem = podeArbitrarPartidas
    ? propostasPendentes.length + solicitacoesWO.length
    : 0;
  const temConteudoPartidas =
    partidasAbertas.length > 0 ||
    partidasEncerradas.length > 0 ||
    pendentesArbitragem > 0;
  const partidasContent = (
    <>
      {podeArbitrarPartidas && propostasPendentes.length > 0 ? (
        <SecaoTorneio
          id="propostas-titulo"
          titulo="Resultados pendentes"
          Icon={ClipboardCheck}
        >
          <PropostasPendentes tournamentId={id} propostas={propostasPendentes} />
        </SecaoTorneio>
      ) : null}

      {podeArbitrarPartidas && solicitacoesWO.length > 0 ? (
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
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Evidência opcional do W.O.: rota assinada (bucket privado),
                      nunca <img> direto. Só quando há foto anexada. */}
                  {s.temFoto ? (
                    <a
                      href={`/dashboard/torneios/${id}/evidencia/wo/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex min-h-10 items-center underline-offset-4 hover:underline"
                    >
                      Ver foto
                    </a>
                  ) : null}
                  <ResponderWoButtons requestId={s.id} />
                </div>
              </li>
            ))}
          </ul>
        </SecaoTorneio>
      ) : null}

      {/* Em aberto: contexto para todos; botão Encerrar/placar só para quem
          ARBITRA (dono, admin ou árbitro). Paginado por rodada (passador). */}
      {partidasAbertas.length > 0 ? (
        <SecaoTorneio id="abertas-titulo" titulo="Partidas em aberto" Icon={Swords}>
          <OpenMatchesList
            partidas={partidasAbertas}
            mostrarEncerrar={podeArbitrarPartidas}
            convocacao={{ userId: user.id, titulo, tournamentId: id }}
            rodadaAtiva={rodadaAtiva}
            tournamentId={id}
          />
        </SecaoTorneio>
      ) : null}

      {partidasEncerradas.length > 0 ? (
        <SecaoTorneio id="historico-titulo" titulo="Partidas encerradas" Icon={History}>
          <MatchHistoryList
            partidas={partidasEncerradas}
            mostrarReabrir={podeArbitrarPartidas}
          />
        </SecaoTorneio>
      ) : null}
    </>
  );

  // ABA "Rodadas": cadência (liberar/recolher) + compartilhar a rodada. Só quando
  // há cadência a exercer (capacidade ARBITRAR, formato gerado com mapa de
  // rodadas). NOTA: `rodadasLiberacao` (ocultas) vem completo só ao DONO pela RLS.
  const temRodadas = arbitrar && ehGerado && rodadasLiberacao.length > 0;
  const rodadasContent = temRodadas ? (
    <SecaoTorneio
      id="liberacao-titulo"
      titulo="Liberação de rodadas"
      Icon={CalendarClock}
    >
      <LiberarRodadasButtons
        tournamentId={id}
        rodadasLiberacao={rodadasLiberacao}
        proximaRodadaOculta={proximaRodadaOculta}
        ehGrupos={ehGrupos}
      />
      {rodadasLiberacao.some((r) => r.liberada) ? (
        <div className="mt-4 flex flex-col gap-2 border-t pt-4">
          <p className="text-muted-foreground text-xs">
            Compartilhe a rodada no WhatsApp (imagem + lista). No celular, abre o
            compartilhamento; no computador, copia o texto e baixa a imagem.
          </p>
          <div className="flex flex-wrap gap-2">
            {rodadasLiberacao
              .filter((r) => r.liberada)
              .map((r) => (
                <CompartilharRodadaButton
                  key={r.rodada}
                  tournamentId={id}
                  rodada={r.rodada}
                  titulo={titulo}
                  texto={mensagemRodada({
                    titulo,
                    rodada: r.rodada,
                    confrontos: confrontosTextoDaRodada(
                      r.rodada,
                      partidasAbertas,
                      partidasEncerradas
                    ),
                    tournamentId: id,
                  })}
                />
              ))}
          </div>
        </div>
      ) : null}
    </SecaoTorneio>
  ) : null;

  // ABA "Vagas" (competitivo) / "Participantes" (avulso) + convite genérico.
  const vagasContent = ehGerado ? (
    <VagasSection
      vagas={vagas}
      userId={user.id}
      podeModerar={moderar}
      tournamentId={id}
      torneioEncerrado={torneio.status === "encerrado"}
      codigos={codigosVagas}
      compartilhar={compartilharTimes}
    />
  ) : (
    <>
      <ParticipantsSection
        tournamentId={id}
        participantes={participantes}
        userId={user.id}
        ehDono={ehDono}
        podeModerar={moderar}
        torneioEncerrado={torneio.status === "encerrado"}
      />

      {/* Convite genérico (EXCLUSIVO do avulso) = capacidade MODERAR em torneio
          aberto (encerrado não aceita entrada — exibir o link seria beco sem saída). */}
      {podeModerarParticipacao ? (
        <InviteSection tournamentId={id} code={codigoConvite} />
      ) : null}
    </>
  );

  const abas: AbaTorneio[] = [
    {
      value: "classificacao",
      label: "Classificação",
      labelCurto: "Class.",
      icon: <ListOrdered aria-hidden="true" />,
      content: classificacaoContent,
    },
    ...(temConteudoPartidas
      ? [
          {
            value: "partidas",
            label: "Partidas",
            labelCurto: "Part.",
            icon: <Swords aria-hidden="true" />,
            content: partidasContent,
            // Mantém o passador montado: trocar de aba não reseta a rodada navegada.
            forceMount: true,
            badge: pendentesArbitragem || undefined,
          } satisfies AbaTorneio,
        ]
      : []),
    ...(temRodadas
      ? [
          {
            value: "rodadas",
            label: "Rodadas",
            labelCurto: "Rod.",
            icon: <CalendarClock aria-hidden="true" />,
            content: rodadasContent,
          } satisfies AbaTorneio,
        ]
      : []),
    {
      value: "vagas",
      label: ehGerado ? "Vagas" : "Participantes",
      labelCurto: ehGerado ? "Vagas" : "Times",
      icon: <Users aria-hidden="true" />,
      content: vagasContent,
    },
  ];

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
            icon={<formatoMeta.Icon className="size-6" />}
            primary={primaria}
            secondary={secundaria}
            className="size-12 rounded-xl ring-1 ring-primary/20"
          />
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
        {/* Cabeçalho: "Ver liga" (navegação para a pirâmide-mãe) disponível a
            QUALQUER visitante de uma divisão — é como o jogador chega à liga
            (add-liga-visao-leitura). Ações de GESTÃO (Cores, Nova partida) só a
            quem gere. */}
        {ligaSeasonId || gerir ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {ligaSeasonId ? (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="text-muted-foreground rounded-full"
              >
                <Link href={`/dashboard/ligas/${ligaSeasonId}`}>
                  <Layers aria-hidden="true" />
                  Ver liga
                </Link>
              </Button>
            ) : null}
            {gerir ? (
              <>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground rounded-full"
                >
                  <Link href={`/dashboard/torneios/${id}/cores`}>
                    <Palette aria-hidden="true" />
                    Cores
                  </Link>
                </Button>
                <CompartilharCompetitionButton
                  path={`/dashboard/torneios/${id}`}
                  titulo={titulo}
                />
                {!ehGerado && torneio.status !== "encerrado" ? (
                  <Button asChild size="sm" className="rounded-full">
                    <Link href={`/dashboard/torneios/${id}/partidas/nova`}>
                      <Plus aria-hidden="true" />
                      Nova partida
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
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

      {/* Administração do torneio = capacidade GERIR (dono ou admin da equipe):
          gestão da equipe + lifecycle (encerrar é GERIR; reabrir é exclusivo do
          DONO). Fica no TOPO, junto do cabeçalho (fora das abas) — decisão do
          dono: encerrar/reabrir no cabeçalho. */}
      {gerir ? (
        <section
          aria-labelledby="lifecycle-titulo"
          className="flex flex-col gap-3"
        >
          <h2
            id="lifecycle-titulo"
            className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            Administração do torneio
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Equipe própria só no torneio AVULSO/raiz: numa DIVISÃO a equipe é
                a da liga-mãe (superfície única) — o link é omitido (a gestão é
                pela página da liga). */}
            {!ehDivisao ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="min-h-10 rounded-full px-4"
              >
                <Link href={`/dashboard/torneios/${id}/equipe`}>
                  <Users aria-hidden="true" />
                  Equipe
                </Link>
              </Button>
            ) : null}
            <TournamentLifecycleButtons
              tournamentId={id}
              encerrado={torneio.status === "encerrado"}
              partidasAbertas={partidasAbertas.length}
              podeReabrir={ehDono}
            />
          </div>
          {/* Vitrine pública (add-vitrine-publica-e-compartilhar): só torneio de
              TOPO se lista (divisão se publica pela liga-mãe). */}
          {!ehDivisao ? (
            <ListarVitrineToggle
              tipo="torneio"
              tournamentId={id}
              listada={torneio.listada}
            />
          ) : null}
        </section>
      ) : null}

      <TournamentTabs abas={abas} padrao="classificacao" />
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

/**
 * Aviso ao NÃO-DONO quando o torneio está ativo mas nenhuma rodada foi
 * liberada (cadência manual). Substitui os empty-states de "não iniciado",
 * que mentiriam aqui — o torneio já começou; só falta o organizador liberar.
 */
function AvisoAguardandoLiberacao() {
  return (
    <section
      aria-labelledby="aguardando-titulo"
      className="bg-muted/10 flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-10 text-center"
    >
      <span
        aria-hidden="true"
        className="bg-primary/8 text-primary/70 flex size-12 items-center justify-center rounded-full"
      >
        <Lock className="size-5" />
      </span>
      <h2
        id="aguardando-titulo"
        className="font-display text-base font-bold tracking-tight"
      >
        As próximas rodadas ainda não foram liberadas pelo organizador.
      </h2>
      <p className="text-muted-foreground max-w-xs text-sm">
        Volte em breve — o organizador vai liberar as rodadas.
      </p>
    </section>
  );
}
