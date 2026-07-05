import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getActiveMatches } from "@/features/match/data/getActiveMatches";
import { getMeusTorneios } from "@/features/tournament/data/getMeusTorneios";
import { getOwnTournaments } from "@/features/tournament/data/getOwnTournaments";
import { deriveEmptyStateFlags } from "@/features/match/emptyStateFlags";
import { MatchCard } from "@/features/match/components/MatchCard";
import { LiveMatchesProvider } from "@/features/match/live/LiveMatchesProvider";
import { EmptyActiveMatches } from "@/features/match/components/EmptyActiveMatches";

export const metadata: Metadata = {
  title: "Painel · Goliseu",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a própria RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const partidas = await getActiveMatches();

  // Os torneios só importam para o estado-vazio (o único ramo que os usa) —
  // não onerar quem tem partida ativa. Em paralelo por serem independentes.
  const flags =
    partidas.length === 0
      ? await (async () => {
          const [meus, avulsos] = await Promise.all([
            getMeusTorneios(user.id),
            getOwnTournaments(user.id),
          ]);
          return deriveEmptyStateFlags({
            organizoCount: meus.organizo.length,
            participoCount: meus.participo.length,
            avulsosAbertosCount: avulsos.length,
          });
        })()
      : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Marca, navegação (Novo torneio/Nova partida) e Sair vivem no
          header persistente do layout do segmento. */}
      <section aria-labelledby="partidas-ativas-titulo" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span
            aria-hidden="true"
            className="flex items-center gap-1.5 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase"
          >
            <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
            Ao vivo no Goliseu
          </span>
          <h1
            id="partidas-ativas-titulo"
            className="font-display text-3xl font-bold tracking-tight"
          >
            Partidas ativas
          </h1>
        </div>

        {partidas.length === 0 ? (
          <EmptyActiveMatches
            semTorneios={flags!.semTorneios}
            temAvulsoAberto={flags!.temAvulsoAberto}
          />
        ) : (
          <LiveMatchesProvider
            initial={partidas.map((p) => ({
              id: p.id,
              placar_1: p.placar_1,
              placar_2: p.placar_2,
              status: p.status,
            }))}
          >
            <ul className="flex list-none flex-col gap-4 p-0">
              {partidas.map((partida, i) => (
                <MatchCard
                  key={partida.id}
                  partida={partida}
                  userId={user.id}
                  index={i}
                />
              ))}
            </ul>
          </LiveMatchesProvider>
        )}
      </section>

      <footer className="text-center text-xs text-muted-foreground">
        Dados e escudos de clubes via API-Football.
      </footer>
    </main>
  );
}
