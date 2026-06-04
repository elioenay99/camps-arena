import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DESTAQUES = [
  {
    titulo: "Torneios do seu jeito",
    descricao:
      "Crie torneios públicos ou privados e defina quantos pontos valem vitória, empate e derrota.",
  },
  {
    titulo: "Placar na palma da mão",
    descricao:
      "Cada participante lança o placar da própria partida direto do celular, com clube e escudo.",
  },
  {
    titulo: "Classificação automática",
    descricao:
      "Tabela atualizada a cada resultado, com desempate por vitórias, saldo, gols e confronto direto.",
  },
] as const;

export default async function Home() {
  // Landing é material de aquisição: quem já tem sessão vai direto ao painel.
  // Auth indisponível NÃO pode derrubar a página pública — falha vira
  // visitante anônimo. redirect() fora do try (lança NEXT_REDIRECT).
  let user = null;
  try {
    const supabase = await createClient();
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    user = null;
  }
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-16">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.3em] text-muted-foreground">
          ARENA
        </span>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </div>

      <section className="flex flex-col items-center gap-6 text-center">
        <h1 className="max-w-xl text-balance text-4xl font-bold tracking-tight">
          Seu campeonato entre amigos, organizado de verdade
        </h1>
        <p className="text-muted-foreground max-w-md text-balance">
          Crie torneios, registre partidas e acompanhe a classificação em tempo
          real — sem planilha, sem discussão de placar.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/cadastro">Criar conta grátis</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Já tenho conta</Link>
          </Button>
        </div>
      </section>

      <section aria-label="Destaques do produto" className="grid gap-4 sm:grid-cols-3">
        {DESTAQUES.map((destaque) => (
          <Card key={destaque.titulo}>
            <CardHeader>
              <CardTitle className="text-base">{destaque.titulo}</CardTitle>
              <CardDescription>{destaque.descricao}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <footer className="text-center text-xs text-muted-foreground/70">
        Dados e escudos de clubes via API-Football.
      </footer>
    </main>
  );
}
