import { KeyRound, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"
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

/** Card de seção da conta: cabeçalho com ícone em chip + título display. */
function SecaoCard({
  Icon,
  titulo,
  descricao,
  children,
}: {
  Icon: LucideIcon
  titulo: string
  descricao: string
  children: React.ReactNode
}) {
  return (
    <Card className="border-primary/10 w-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary ring-primary/20 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1"
          >
            <Icon className="size-5" />
          </span>
          <div className="grid gap-1">
            <CardTitle className="font-display text-lg">{titulo}</CardTitle>
            <CardDescription>{descricao}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  )
}

export default async function ContaPage() {
  const perfil = await getPerfil()

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-2xl font-bold">Conta</h1>

      <SecaoCard
        Icon={User}
        titulo="Perfil"
        descricao="Sua foto, nome e celular — visíveis para os outros participantes."
      >
        <AvatarUpload
          nome={perfil?.nome ?? null}
          avatarUrl={perfil?.avatar ?? null}
        />
        <ProfileForm
          nome={perfil?.nome ?? null}
          celular={perfil?.celular ?? null}
        />
      </SecaoCard>

      <SecaoCard
        Icon={KeyRound}
        titulo="Alterar senha"
        descricao="Confirme a senha atual para definir uma nova."
      >
        <ChangePasswordForm />
      </SecaoCard>
    </main>
  )
}
