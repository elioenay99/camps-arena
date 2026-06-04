import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MatchCreateForm } from "@/features/match/components/MatchCreateForm";
import { getParticipantesDisponiveis } from "@/features/match/data/getParticipantesDisponiveis";
import { getOwnTournaments } from "@/features/tournament/data/getOwnTournaments";

export const metadata: Metadata = {
  title: "Nova partida · Arena",
};

export default async function NovaPartidaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard/partidas/nova");
  }

  // Só torneios do usuário são elegíveis (a RLS de INSERT em matches exige o
  // dono); sem torneio próprio, orienta a criar um antes.
  const torneios = await getOwnTournaments(user.id);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Nova partida</CardTitle>
          <CardDescription>
            Crie uma partida em um dos seus torneios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {torneios.length === 0 ? (
            <div className="grid gap-4 text-center">
              <p className="text-muted-foreground text-sm">
                Você ainda não tem um torneio aberto. Crie um torneio para
                organizar as suas partidas.
              </p>
              <Button asChild>
                <Link href="/dashboard/torneios/novo">Criar torneio</Link>
              </Button>
            </div>
          ) : (
            <MatchCreateForm
              torneios={torneios}
              participantes={await getParticipantesDisponiveis()}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
