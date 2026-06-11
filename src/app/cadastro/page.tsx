import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/components/AuthShell";
import { SignupForm } from "@/features/auth/components/SignupForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Criar conta · Goliseu",
};

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <AuthShell tagline="Crie sua conta e entre em campo">
      <Card className="elevate w-full border-primary/15">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Criar conta</CardTitle>
          <CardDescription>
            Cadastre-se para organizar e disputar partidas no Goliseu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm redirectTo={redirectTo} />
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-sm">
            Já tem conta?{" "}
            <Link
              href={
                redirectTo
                  ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
                  : "/login"
              }
              className="underline underline-offset-4"
            >
              Entrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
