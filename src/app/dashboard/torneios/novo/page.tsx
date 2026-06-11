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
  title: "Novo torneio · Goliseu",
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
    <main className="flex flex-1 items-start justify-center px-6 py-10 sm:items-center">
      <Card className="elevate animate-rise w-full max-w-xl">
        <CardHeader>
          <CardTitle className="font-display text-2xl font-bold">
            Novo torneio
          </CardTitle>
          <CardDescription>
            Escolha o formato e o Goliseu cuida do resto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TournamentForm />
        </CardContent>
      </Card>
    </main>
  );
}
