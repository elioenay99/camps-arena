import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { StandingsTable } from "@/features/standings/components/StandingsTable";
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao";
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

  const { torneio, linhas } = classificacao;
  const titulo = torneio.titulo.trim() || "Torneio";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.3em] text-muted-foreground">
          ARENA
        </span>
        <Link
          href="/dashboard"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          Voltar ao painel
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        <p className="text-muted-foreground text-sm">
          {`Torneio ${LABEL_STATUS[torneio.status]} • vitória ${torneio.pontos_vitoria} · empate ${torneio.pontos_empate} · derrota ${torneio.pontos_derrota}`}
        </p>
      </header>

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
    </main>
  );
}
