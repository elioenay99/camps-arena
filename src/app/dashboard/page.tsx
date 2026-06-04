import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getActiveMatches } from "@/features/match/data/getActiveMatches";
import { MatchCard } from "@/features/match/components/MatchCard";
import { EmptyActiveMatches } from "@/features/match/components/EmptyActiveMatches";

export const metadata: Metadata = {
  title: "Painel · Arena",
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.3em] text-muted-foreground">
          ARENA
        </span>
        <form action={logout}>
          <Button variant="outline" size="sm" type="submit">
            Sair
          </Button>
        </form>
      </div>

      <section aria-labelledby="partidas-ativas-titulo" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h1 id="partidas-ativas-titulo" className="text-2xl font-semibold">
            Partidas ativas
          </h1>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/torneios/novo">Novo torneio</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/partidas/nova">Nova partida</Link>
            </Button>
          </div>
        </div>

        {partidas.length === 0 ? (
          <EmptyActiveMatches />
        ) : (
          <ul className="flex list-none flex-col gap-4 p-0">
            {partidas.map((partida) => (
              <MatchCard key={partida.id} partida={partida} />
            ))}
          </ul>
        )}
      </section>

      <footer className="text-center text-xs text-muted-foreground/70">
        Dados e escudos de clubes via API-Football.
      </footer>
    </main>
  );
}
