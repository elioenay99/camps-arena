import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TournamentForm } from "@/features/tournament/components/TournamentForm";

export const metadata: Metadata = {
  title: "Novo torneio · Arena",
};

export default async function NovoTorneioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard/torneios/novo");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Novo torneio</CardTitle>
          <CardDescription>
            Crie um torneio para organizar as suas partidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TournamentForm />
        </CardContent>
      </Card>
    </main>
  );
}
