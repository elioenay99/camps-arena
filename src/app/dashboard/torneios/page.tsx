import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, Trophy } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FORMATO_META } from "@/features/tournament/formatoMeta";
import { StatusPill } from "@/features/tournament/components/StatusPill";
import { getMeusTorneios, type TorneioResumo } from "@/features/tournament/data/getMeusTorneios";

export const metadata: Metadata = {
  title: "Torneios · Goliseu",
};

function ListaTorneios({ torneios }: { torneios: TorneioResumo[] }) {
  return (
    <ul className="grid list-none gap-2.5 p-0">
      {torneios.map((t, i) => {
        const { label, Icon } = FORMATO_META[t.formato];
        return (
          <li
            key={t.id}
            className="animate-rise"
            style={{ "--stagger": `${i * 45}ms` } as React.CSSProperties}
          >
            {/* Sem prefetch: a lista prefetcharia N rotas torneios/[id] (RSC
                caras) de uma vez; a rajada estourava a borda da Vercel (503).
                Ver add-dashboard-prefetch-hardening. */}
            <Link
              href={`/dashboard/torneios/${t.id}`}
              prefetch={false}
              className="elevate-hover group flex items-center gap-3.5 rounded-xl border bg-card/80 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {t.titulo.trim() || "Torneio"}
                </span>
                <span className="text-muted-foreground text-xs">{label}</span>
              </span>
              <StatusPill status={t.status} />
              <ChevronRight
                aria-hidden="true"
                className="text-muted-foreground/40 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Estado vazio convidativo do índice de torneios. */
function SemTorneios() {
  return (
    <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="glow-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Trophy className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold">Seu primeiro torneio</h2>
        <p className="text-muted-foreground text-sm">
          Crie um torneio de pontos corridos, mata-mata ou fase de grupos — ou
          peça um link de convite a quem organiza e entre em campo.
        </p>
      </div>
      <Button asChild className="rounded-full">
        <Link href="/dashboard/torneios/novo">
          <Plus aria-hidden="true" />
          Criar torneio
        </Link>
      </Button>
    </Card>
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
        <Button asChild size="sm" className="rounded-full">
          <Link href="/dashboard/torneios/novo">
            <Plus aria-hidden="true" />
            Criar torneio
          </Link>
        </Button>
      </header>

      {semTorneios ? (
        <SemTorneios />
      ) : (
        <>
          {organizo.length > 0 ? (
            <section aria-labelledby="organizo-titulo" className="flex flex-col gap-4">
              <h2
                id="organizo-titulo"
                className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
                Organizo
              </h2>
              <ListaTorneios torneios={organizo} />
            </section>
          ) : null}

          {participo.length > 0 ? (
            <section aria-labelledby="participo-titulo" className="flex flex-col gap-4">
              <h2
                id="participo-titulo"
                className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
              >
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
