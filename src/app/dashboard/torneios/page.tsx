import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getMeusTorneios, type TorneioResumo } from "@/features/tournament/data/getMeusTorneios";
import type { TournamentStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = {
  title: "Torneios · Arena",
};

const LABEL_STATUS: Record<TournamentStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  encerrado: "Encerrado",
};

function ListaTorneios({ torneios }: { torneios: TorneioResumo[] }) {
  return (
    <ul className="grid list-none gap-2 p-0">
      {torneios.map((t) => (
        <li key={t.id}>
          <Link
            href={`/dashboard/torneios/${t.id}`}
            className="hover:bg-accent flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors"
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {t.titulo.trim() || "Torneio"}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {LABEL_STATUS[t.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Índice de torneios: descoberta para quem aceita convite (sem isso, o único
 * caminho até um torneio é o link de uma partida no dashboard).
 */
export default async function TorneiosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard/torneios");
  }

  const { organizo, participo } = await getMeusTorneios(user.id);
  const semTorneios = organizo.length === 0 && participo.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-bold tracking-tight">Torneios</h1>
          <p className="text-muted-foreground text-sm">
            Os torneios que você organiza e os que você disputa.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/torneios/novo">Criar torneio</Link>
        </Button>
      </header>

      {semTorneios ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          Você ainda não tem torneios. Crie o primeiro ou peça um link de
          convite a quem organiza.
        </p>
      ) : (
        <>
          {organizo.length > 0 ? (
            <section aria-labelledby="organizo-titulo" className="flex flex-col gap-4">
              <h2 id="organizo-titulo" className="text-lg font-semibold">
                Organizo
              </h2>
              <ListaTorneios torneios={organizo} />
            </section>
          ) : null}

          {participo.length > 0 ? (
            <section aria-labelledby="participo-titulo" className="flex flex-col gap-4">
              <h2 id="participo-titulo" className="text-lg font-semibold">
                Participo
              </h2>
              <ListaTorneios torneios={participo} />
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
