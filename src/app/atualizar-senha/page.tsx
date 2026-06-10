import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/components/AuthShell";
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
    <AuthShell tagline="Defina uma nova senha">
      <Card className="elevate w-full border-primary/15">
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
    </AuthShell>
  );
}
