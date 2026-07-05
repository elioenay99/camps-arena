import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Swords, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { GoliseuMark } from "@/components/goliseu-mark";
import { HeroStadium } from "@/components/hero-stadium";
import { LandingShowcase } from "@/features/landing/components/LandingShowcase";
import { ProfundidadeCards } from "@/features/landing/components/ProfundidadeCards";
import { TelasAnotadas } from "@/features/landing/components/TelasAnotadas";
import { ComoFunciona } from "@/features/landing/components/ComoFunciona";
import { ProvaSocial } from "@/features/landing/components/ProvaSocial";
import { Faq } from "@/features/landing/components/Faq";
import { ConversaoCta } from "@/features/landing/components/ConversaoCta";
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
    icone: Trophy,
    titulo: "Torneios do seu jeito",
    descricao:
      "Crie torneios públicos ou privados e defina quantos pontos valem vitória, empate e derrota.",
  },
  {
    icone: Swords,
    titulo: "Placar na palma da mão",
    descricao:
      "Cada participante lança o placar da própria partida direto do celular, com clube e escudo.",
  },
  {
    icone: Users,
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
    <div className="spotlight flex w-full flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-16 px-6 py-16">
        <header
          className="animate-rise flex w-full items-center justify-between"
          style={{ "--stagger": "0ms" } as React.CSSProperties}
        >
          <span className="group flex items-center gap-2">
            <GoliseuMark className="goliseu-mark-draw goliseu-mark-glow size-7 text-primary" />
            <span className="font-display text-lg font-bold tracking-[0.25em]">
              GOLISEU<span className="text-primary">.</span>
            </span>
          </span>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
          </div>
        </header>

        <section
          className="animate-rise flex flex-col items-center gap-6 text-center"
          style={{ "--stagger": "90ms" } as React.CSSProperties}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            <span aria-hidden="true" className="ball-bounce">⚽</span>
            Torneios entre amigos, nível profissional
          </span>
          <h1 className="font-display max-w-2xl text-balance text-5xl font-bold tracking-tight sm:text-6xl">
            Monte a sua{" "}
            <span className="text-gradient-brand">liga nacional</span> entre amigos
          </h1>
          <p className="max-w-lg text-balance text-lg text-muted-foreground">
            Divisões, acesso e rebaixamento, temporadas e copas que duram para
            sempre. Tudo com escudo, classificação automática — e sem planilha nem
            discussão de placar.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="glow-primary">
              <Link href="/cadastro">Criar conta grátis</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Já tenho conta</Link>
            </Button>
          </div>
        </section>

        {/* -mt aproxima a ilustração do hero (contrabalança o gap-16 do <main>). */}
        <section
          aria-hidden="true"
          className="animate-rise -mt-6 flex justify-center sm:-mt-8"
          style={{ "--stagger": "180ms" } as React.CSSProperties}
        >
          <HeroStadium className="w-full max-w-xl" />
        </section>

        <LandingShowcase />

        <section
          aria-label="Destaques do produto"
          className="animate-rise grid gap-4 sm:grid-cols-3"
          style={{ "--stagger": "360ms" } as React.CSSProperties}
        >
          {DESTAQUES.map((destaque) => {
            const Icone = destaque.icone;
            return (
              <Card
                key={destaque.titulo}
                className="motion-safe:transition-transform motion-safe:duration-200 hover:border-primary/30 motion-safe:hover:-translate-y-0.5"
              >
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className="mb-2 inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <Icone className="size-5" />
                  </span>
                  <CardTitle className="font-display text-base">
                    {destaque.titulo}
                  </CardTitle>
                  <CardDescription>{destaque.descricao}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </section>

        <ProfundidadeCards />

        <TelasAnotadas />

        <ComoFunciona />

        <ProvaSocial />

        <Faq />

        <ConversaoCta />

        <footer className="mt-auto border-t pt-8 text-center text-xs text-muted-foreground">
          Dados e escudos de clubes via API-Football.
        </footer>
      </main>
    </div>
  );
}
