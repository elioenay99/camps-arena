import type { Metadata } from "next";
import Link from "next/link";

import { AuthBrand } from "@/features/auth/components/AuthBrand";
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
  title: "Entrar · Arena",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; aviso?: string }>;
}) {
  const { redirectTo, aviso } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <AuthBrand />
      <Card className="w-full max-w-sm border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Entrar</CardTitle>
          <CardDescription>
            Acesse o painel do Arena para gerir suas partidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {aviso === "link-invalido" ? (
            <p className="text-destructive text-sm" role="alert">
              Link inválido ou expirado. Faça login ou solicite um novo link.
            </p>
          ) : null}
          <LoginForm redirectTo={redirectTo} />
          <Link
            href="/recuperar-senha"
            className="text-muted-foreground text-sm underline underline-offset-4"
          >
            Esqueci minha senha
          </Link>
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
    </main>
  );
}
