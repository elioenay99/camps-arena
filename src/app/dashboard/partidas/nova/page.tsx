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
import { getOwnTournaments } from "@/features/tournament/data/getOwnTournaments";

export const metadata: Metadata = {
  title: "Nova partida · Arena",
};

/**
 * Seletor de torneio: o form de partida mora na rota aninhada do torneio
 * (os selects de participante dependem do torneio escolhido). Lista de LINKS
 * em vez de select+submit — navegação pura, zero JS.
 */
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
            Escolha o torneio que vai receber a partida.
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
            <ul className="grid list-none gap-2 p-0">
              {torneios.map((t) => (
                <li key={t.id}>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href={`/dashboard/torneios/${t.id}/partidas/nova`}>
                      {t.titulo.trim() || "Torneio"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
