import { redirect } from "next/navigation";

import { logout } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defesa em profundidade: além do proxy, a própria RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

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

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Painel</CardTitle>
          <CardDescription>Sessão ativa: {user.email}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A listagem de partidas ativas chega na Fase 5. Por ora, a área
          autenticada está protegida pelo proxy e pela verificação de sessão na
          própria página.
        </CardContent>
      </Card>
    </main>
  );
}
