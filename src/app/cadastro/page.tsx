import type { Metadata } from "next";
import Link from "next/link";

import { AuthBrand } from "@/features/auth/components/AuthBrand";
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
  title: "Criar conta · Arena",
};

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <AuthBrand />
      <Card className="w-full max-w-sm border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Criar conta</CardTitle>
          <CardDescription>
            Cadastre-se para organizar e disputar partidas no Arena.
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
    </main>
  );
}
