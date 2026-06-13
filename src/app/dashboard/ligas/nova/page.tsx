import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LeagueWizard } from "@/features/league/components/LeagueWizard"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Nova pirâmide · Goliseu",
}

export default async function NovaLigaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect("/login?redirectTo=/dashboard/ligas/nova")
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Nova pirâmide
        </h1>
        <p className="text-muted-foreground text-sm">
          Empilhe divisões com acesso e queda. A pirâmide é imortal — as
          temporadas se sucedem dentro dela.
        </p>
      </header>

      <Card className="elevate animate-rise">
        <CardHeader>
          <CardTitle className="font-display text-xl font-bold">
            Montar a pirâmide
          </CardTitle>
          <CardDescription>
            Quatro passos: formato, divisões, acesso/queda e competidores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeagueWizard />
        </CardContent>
      </Card>
    </main>
  )
}
