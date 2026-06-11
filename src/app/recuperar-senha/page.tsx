import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/components/AuthShell";
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
  title: "Recuperar senha · Goliseu",
};

export default function RecuperarSenhaPage() {
  return (
    <AuthShell tagline="Vamos recuperar seu acesso">
      <Card className="elevate w-full border-primary/15">
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
    </AuthShell>
  );
}
