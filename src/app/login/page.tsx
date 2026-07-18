import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/components/AuthShell";
import { LoginForm } from "@/features/auth/components/LoginForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Entrar · Goliseu",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; aviso?: string }>;
}) {
  const { redirectTo, aviso } = await searchParams;

  return (
    <AuthShell>
      <Card className="elevate w-full border-primary/15">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Entrar</CardTitle>
          <CardDescription>
            Acesse o painel do Goliseu para gerir suas partidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {aviso === "link-invalido" ? (
            <p className="text-destructive text-sm" role="alert">
              Link inválido ou expirado. Faça login ou solicite um novo link.
            </p>
          ) : null}
          <LoginForm redirectTo={redirectTo} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/recuperar-senha"
              className="text-muted-foreground text-sm underline underline-offset-4"
            >
              Esqueci minha senha
            </Link>
            <Link
              href="/demo"
              className="text-primary text-sm underline underline-offset-4"
            >
              Ver demonstração
            </Link>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-sm">
            Ainda não tem conta?{" "}
            <Link
              href={
                redirectTo
                  ? `/cadastro?redirectTo=${encodeURIComponent(redirectTo)}`
                  : "/cadastro"
              }
              className="underline underline-offset-4"
            >
              Criar conta
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
