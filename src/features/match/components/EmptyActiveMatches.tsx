import { Swords } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** Estado vazio amigável — sem CTA (não há fluxo de criação na Fase 5). */
export function EmptyActiveMatches() {
  return (
    <Card className="items-center py-12 text-center">
      <CardHeader className="items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <Swords className="size-7" />
        </span>
        <CardTitle className="font-display text-xl">Nenhuma partida ativa</CardTitle>
        <CardDescription className="max-w-xs text-balance">
          Quando uma partida estiver agendada ou em andamento, ela aparece aqui
          para o lançamento de placar.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  )
}
