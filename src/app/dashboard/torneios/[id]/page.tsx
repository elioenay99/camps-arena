import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MatchHistoryList } from "@/features/match/components/MatchHistoryList";
import { OpenMatchesList } from "@/features/match/components/OpenMatchesList";
import { StandingsTable } from "@/features/standings/components/StandingsTable";
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao";
import { IniciarTorneioPanel } from "@/features/tournament/components/IniciarTorneioPanel";
import { InviteSection } from "@/features/tournament/components/InviteSection";
import { ParticipantsSection } from "@/features/tournament/components/ParticipantsSection";
import { getConviteDoTorneio } from "@/features/tournament/data/getConviteDoTorneio";
import { getParticipantesDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio";
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

  const { torneio, linhas, partidasEncerradas, clubes, partidasAbertas } =
    classificacao;
  const titulo = torneio.titulo.trim() || "Torneio";
  // Console do dono (encerrar/reabrir). O botão é UX — a autorização real é a
  // action + RLS + trigger no banco. Torneio encerrado congela o lifecycle
  // (reabrir ali seria beco sem saída: a partida some do dashboard e de toda
  // edição); torneio sem dono (created_by NULL, semeados) não tem console.
  const ehDono = torneio.created_by !== null && torneio.created_by === user.id;
  const podeGerirPartidas = ehDono && torneio.status !== "encerrado";
  // Liga: partidas nascem da tabela gerada (sem "Nova partida"); o painel de
  // início só existe no rascunho do dono.
  const ehLiga = torneio.formato === "liga";
  const mostrarIniciar = ehDono && ehLiga && torneio.status === "rascunho";

  // Lista de participantes (visível a quem vê o torneio) e, SÓ para o dono de
  // torneio aberto, o código de convite (a RLS de tournament_invites já
  // restringe — o gate aqui evita uma query inútil para os demais).
  const [participantes, codigoConvite] = await Promise.all([
    getParticipantesDoTorneio(id),
    podeGerirPartidas ? getConviteDoTorneio(id) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{titulo}</h1>
          <p className="text-muted-foreground text-sm">
            {`${ehLiga ? `Liga${torneio.ida_e_volta ? " (ida e volta)" : ""}` : "Torneio"} ${LABEL_STATUS[torneio.status]} • vitória ${torneio.pontos_vitoria} · empate ${torneio.pontos_empate} · derrota ${torneio.pontos_derrota}`}
          </p>
        </div>
        {/* Liga não aceita partida manual: as partidas nascem da tabela. */}
        {podeGerirPartidas && !ehLiga ? (
          <Button asChild size="sm">
            <Link href={`/dashboard/torneios/${id}/partidas/nova`}>
              Nova partida
            </Link>
          </Button>
        ) : null}
      </header>

      {mostrarIniciar ? (
        <IniciarTorneioPanel
          tournamentId={id}
          qtdParticipantes={participantes.length}
          idaEVolta={torneio.ida_e_volta}
        />
      ) : null}

      <section aria-labelledby="classificacao-titulo" className="flex flex-col gap-4">
        <h2 id="classificacao-titulo" className="text-lg font-semibold">
          Classificação
        </h2>
        {linhas.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
            A classificação aparece depois da primeira partida encerrada.
          </p>
        ) : (
          <StandingsTable linhas={linhas} />
        )}
      </section>

      {/* Em aberto: contexto para todos; botão Encerrar só para o dono. */}
      {partidasAbertas.length > 0 ? (
        <section aria-labelledby="abertas-titulo" className="flex flex-col gap-4">
          <h2 id="abertas-titulo" className="text-lg font-semibold">
            Partidas em aberto
          </h2>
          <OpenMatchesList
            partidas={partidasAbertas}
            mostrarEncerrar={podeGerirPartidas}
          />
        </section>
      ) : null}

      {/* Seção omitida quando vazia: o estado vazio da classificação já
          comunica "nenhuma encerrada" — duas mensagens seriam ruído. */}
      {partidasEncerradas.length > 0 ? (
        <section aria-labelledby="historico-titulo" className="flex flex-col gap-4">
          <h2 id="historico-titulo" className="text-lg font-semibold">
            Partidas encerradas
          </h2>
          <MatchHistoryList
            partidas={partidasEncerradas}
            mostrarReabrir={podeGerirPartidas}
          />
        </section>
      ) : null}

      {/* Clube é opcional por partida — seção só com clube pontuado. */}
      {clubes.length > 0 ? (
        <section aria-labelledby="clubes-titulo" className="flex flex-col gap-4">
          <h2 id="clubes-titulo" className="text-lg font-semibold">
            Clubes
          </h2>
          <StandingsTable linhas={clubes} rotuloLado="Clube" />
        </section>
      ) : null}

      <ParticipantsSection
        tournamentId={id}
        participantes={participantes}
        userId={user.id}
        ehDono={ehDono}
        torneioEncerrado={torneio.status === "encerrado"}
      />

      {/* Convite: só o dono de torneio aberto gerencia (encerrado não aceita
          entrada — exibir o link seria um beco sem saída). */}
      {podeGerirPartidas ? (
        <InviteSection tournamentId={id} code={codigoConvite} />
      ) : null}
    </main>
  );
}
