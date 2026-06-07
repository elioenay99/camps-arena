import type { Metadata } from "next";

import { AuthBrand } from "@/features/auth/components/AuthBrand";
import { UpdatePasswordForm } from "@/features/auth/components/UpdatePasswordForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Nova senha · Arena",
};

// Rota protegida pelo middleware: só chega aqui com sessão (a de recovery
// criada pelo link de e-mail, ou uma sessão normal trocando a própria senha).
export default function AtualizarSenhaPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <AuthBrand />
      <Card className="w-full max-w-sm border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Definir nova senha</CardTitle>
          <CardDescription>
            Escolha uma nova senha para a sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
