import { ModeToggle } from "@/components/mode-toggle";
import { MatchScoreModal } from "@/features/match/components/MatchScoreModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const partidaDemo = {
  matchId: "00000000-0000-0000-0000-000000000000",
  tituloPartida: "Grêmio x São Paulo",
  subtitulo: "Rodada 6 • Sem prazo",
  descricao: "Jhonathan enfrenta Danilo",
  participante1: { nome: "Jhonathan", celular: "(11) 91234-5678" },
  participante2: { nome: "Danilo", celular: "(11) 99876-5432" },
  placarInicial1: 0,
  placarInicial2: 2,
} as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.3em] text-muted-foreground">
          ARENA
        </span>
        <ModeToggle />
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Fundação pronta</CardTitle>
          <CardDescription>
            Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · next-themes (dark/light)
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Design system configurado com CSS variables e tema escuro como padrão.
          As próximas fases adicionam Supabase, autenticação e o fluxo de
          lançamento de placar das partidas.
        </CardContent>
        <CardFooter className="gap-3">
          <MatchScoreModal
            {...partidaDemo}
            trigger={<Button>Abrir Menu da Partida (demo)</Button>}
          />
        </CardFooter>
      </Card>
    </main>
  );
}
