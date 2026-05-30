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
    <Card className="items-center py-10 text-center">
      <CardHeader className="items-center gap-3">
        <Swords aria-hidden="true" className="size-10 text-muted-foreground" />
        <CardTitle className="text-lg">Nenhuma partida ativa</CardTitle>
        <CardDescription>
          Quando uma partida estiver agendada ou em andamento, ela aparece aqui
          para o lançamento de placar.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  )
}
