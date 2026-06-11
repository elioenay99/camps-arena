import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MatchCreateForm } from "@/features/match/components/MatchCreateForm";
import { getParticipantesDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio";

export const metadata: Metadata = {
  title: "Nova partida · Goliseu",
};

export default async function NovaPartidaDoTorneioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02 (padrão
  // da página do torneio).
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/torneios/${id}/partidas/nova`);
  }

  // Gate por FILTRO: só o DONO de torneio AVULSO não-encerrado vê o form.
  // Inexistente, alheio, invisível, encerrado ou LIGA (partida manual não
  // existe em liga) → o MESMO 404 (sem oráculo de existência) — a autorização
  // real é a action + RLS.
  const { data: torneio, error } = await supabase
    .from("tournaments")
    .select("id, titulo")
    .eq("id", id)
    .eq("created_by", user.id)
    .eq("formato", "avulso")
    .neq("status", "encerrado")
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar o torneio: ${error.message}`);
  }
  if (!torneio) {
    notFound();
  }

  const participantes = await getParticipantesDoTorneio(id);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Nova partida</CardTitle>
          <CardDescription>
            {`Crie uma partida em "${torneio.titulo.trim() || "Torneio"}". Os lados podem ficar a definir.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <MatchCreateForm tournamentId={id} participantes={participantes} />
          <p className="text-muted-foreground text-sm">
            Falta gente?{" "}
            <Link
              href={`/dashboard/torneios/${id}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Convide participantes na página do torneio
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
