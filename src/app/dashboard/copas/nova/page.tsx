import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CupWizard,
  type OrigemCopa,
  type OrigemPiramide,
} from "@/features/cup/components/CupWizard"
import { getCups } from "@/features/cup/data/getCups"
import { getCompetitions } from "@/features/league/data/getCompetitions"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Nova copa · Goliseu",
}

export default async function NovaCopaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirectTo=/dashboard/copas/nova")
  }

  // Origens disponíveis para as regras: pirâmides do dono (com o nº de níveis da
  // temporada corrente) e copas do dono. O consentimento (origem pública/sua) é
  // best-effort na action e autoritativo nas RPCs — aqui só ofertamos as do dono.
  const [piramides, copas] = await Promise.all([
    getCompetitions(user.id),
    getCups(user.id),
  ])

  const origensPiramide: OrigemPiramide[] = piramides
    .filter((p) => p.numDivisoes > 0)
    .map((p) => ({ id: p.id, nome: p.nome.trim() || "Pirâmide", numNiveis: p.numDivisoes }))
  const origensCopa: OrigemCopa[] = copas.map((c) => ({
    id: c.id,
    nome: c.nome.trim() || "Copa",
  }))

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Nova copa</h1>
        <p className="text-muted-foreground text-sm">
          Três passos: formato, regras de qualificação e revisão. A copa é imortal —
          as edições se sucedem dentro dela.
        </p>
      </header>

      <Card className="elevate animate-rise">
        <CardHeader>
          <CardTitle className="font-display text-xl font-bold">Montar a copa</CardTitle>
          <CardDescription>
            Defina o formato, de onde saem as vagas e revise antes de criar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CupWizard piramides={origensPiramide} copas={origensCopa} />
        </CardContent>
      </Card>
    </main>
  )
}
