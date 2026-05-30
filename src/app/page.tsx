import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
          <Button>Começar</Button>
          <Button variant="outline">Documentação</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
