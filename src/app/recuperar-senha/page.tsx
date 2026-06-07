import type { Metadata } from "next";
import Link from "next/link";

import { AuthBrand } from "@/features/auth/components/AuthBrand";
import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Recuperar senha · Arena",
};

export default function RecuperarSenhaPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <AuthBrand />
      <Card className="w-full max-w-sm border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Recuperar senha</CardTitle>
          <CardDescription>
            Informe seu e-mail e enviaremos um link para definir uma nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-sm">
            Lembrou a senha?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
