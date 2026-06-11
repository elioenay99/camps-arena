import type { Metadata } from "next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AvatarUpload } from "@/features/profile/components/AvatarUpload"
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm"
import { ProfileForm } from "@/features/profile/components/ProfileForm"
import { getPerfil } from "@/features/profile/data/getPerfil"

export const metadata: Metadata = {
  title: "Conta · Goliseu",
}

export default async function ContaPage() {
  const perfil = await getPerfil()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-2xl font-bold">Conta</h1>

      <Card className="border-primary/10 w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Perfil</CardTitle>
          <CardDescription>
            Sua foto, nome e celular — visíveis para os outros participantes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarUpload
            nome={perfil?.nome ?? null}
            avatarUrl={perfil?.avatar ?? null}
          />
          <ProfileForm
            nome={perfil?.nome ?? null}
            celular={perfil?.celular ?? null}
          />
        </CardContent>
      </Card>

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
