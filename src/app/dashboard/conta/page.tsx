import type { Metadata } from "next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Conta · Arena",
}

export default async function ContaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold">Conta</h1>
        {user?.email ? (
          <p className="text-muted-foreground text-sm">{user.email}</p>
        ) : null}
      </div>

      <Card className="border-primary/10 w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Alterar senha</CardTitle>
          <CardDescription>
            Confirme a senha atual para definir uma nova.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  )
}
