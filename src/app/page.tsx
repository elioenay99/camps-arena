import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Swords, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { HeroStadium } from "@/components/hero-stadium";
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
          <span className="font-display text-lg font-bold tracking-[0.25em]">
            GOLISEU<span className="text-primary">.</span>
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
            Seu{" "}
            <span className="text-gradient-brand">campeonato</span> entre amigos,
            organizado de verdade
          </h1>
          <p className="max-w-md text-balance text-lg text-muted-foreground">
            Crie torneios, registre partidas e acompanhe a classificação em
            tempo real — sem planilha, sem discussão de placar.
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

        <section
          aria-hidden="true"
          className="animate-rise flex justify-center"
          style={{ "--stagger": "270ms" } as React.CSSProperties}
        >
          <span className="sr-only">
            Exemplo de classificação e placar ao vivo
          </span>
          <div className="glow-primary w-full max-w-md rounded-2xl border bg-card/60 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="font-display text-sm font-medium">
                Copa dos Amigos
              </p>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Liga
              </span>
            </div>

            {/* Classificação sincronizada com o gol do SVG (HeroStadium): Palmeiras
                lidera, e quando a bola entra lá em cima o Flamengo sobe pro 1º
                (troféu) e o placar do jogo vira 1→2 — mesmos times/narrativa do
                SVG, no mesmo loop de 5.5s. Ao mudar nomes/placar, ajuste os DOIS. */}
            <ul className="mt-4 flex flex-col gap-1">
              <li className="trophy-sheen flex items-center gap-3 rounded-md border border-gold/30 bg-gold/10 px-3 py-2">
                <span className="font-display w-6 text-sm font-bold tabular-nums text-gold-ink">
                  1º
                </span>
                <Trophy className="size-4 shrink-0 text-gold-ink" />
                <ValorQueTroca
                  sai="Palmeiras"
                  entra="Flamengo"
                  wrapperClassName="min-w-0 flex-1"
                  className="truncate text-sm font-medium"
                />
                {/* Empate provisório (1×1) → vitória do Flamengo (2×1): 19 → 21. */}
                <ValorQueTroca
                  sai="19"
                  entra="21"
                  className="font-display text-sm font-bold tabular-nums"
                />
              </li>
              <li className="flex items-center gap-3 rounded-md px-3 py-2">
                <span className="font-display w-6 text-sm font-bold tabular-nums text-muted-foreground">
                  2º
                </span>
                <span className="size-4 shrink-0" />
                <ValorQueTroca
                  sai="Flamengo"
                  entra="Palmeiras"
                  wrapperClassName="min-w-0 flex-1"
                  className="truncate text-sm font-medium"
                />
                {/* Empate provisório (1×1) → derrota do Palmeiras (2×1): 19 → 18. */}
                <ValorQueTroca
                  sai="19"
                  entra="18"
                  className="font-display text-sm font-bold tabular-nums"
                />
              </li>
              <li className="flex items-center gap-3 rounded-md px-3 py-2">
                <span className="font-display w-6 text-sm font-bold tabular-nums text-muted-foreground">
                  3º
                </span>
                <span className="size-4 shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">Fluminense</span>
                <span className="font-display text-sm font-bold tabular-nums">13</span>
              </li>
            </ul>

            <div className="mt-4 flex items-center gap-2 border-t pt-4 text-sm">
              <span className="font-medium">Flamengo</span>
              {/* Placar muda junto com o do SVG (1 → 2). */}
              <span className="grid font-display font-bold tabular-nums">
                <span className="hs-score-a col-start-1 row-start-1 text-center">1</span>
                <span className="hs-score-b col-start-1 row-start-1 text-center">2</span>
              </span>
              <span className="text-xs text-muted-foreground">×</span>
              <span className="font-display font-bold tabular-nums">1</span>
              <span className="font-medium">Palmeiras</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
                em andamento
              </span>
            </div>
          </div>
        </section>

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

        <footer className="mt-auto border-t pt-8 text-center text-xs text-muted-foreground">
          Dados e escudos de clubes via API-Football.
        </footer>
      </main>
    </div>
  );
}

/**
 * Valor (nome OU pontos) que TROCA no gol, sincronizado com o SVG: o que sai some
 * sutilmente e o que entra desliza para dentro. Os dois ficam empilhados na MESMA
 * célula de grid (sem position absoluto) — a célula dimensiona pelo maior. Sob
 * `prefers-reduced-motion` as classes hs-rank-* param: o estado base mostra só o
 * "sai" (classificação inicial: Palmeiras 1º com 19, Flamengo 2º com 19).
 */
function ValorQueTroca({
  sai,
  entra,
  className,
  wrapperClassName,
}: {
  sai: string;
  entra: string;
  className?: string;
  wrapperClassName?: string;
}) {
  const item = `col-start-1 row-start-1${className ? ` ${className}` : ""}`;
  return (
    <span className={`grid${wrapperClassName ? ` ${wrapperClassName}` : ""}`}>
      <span className={`hs-rank-out ${item}`}>{sai}</span>
      <span className={`hs-rank-in ${item}`}>{entra}</span>
    </span>
  );
}
