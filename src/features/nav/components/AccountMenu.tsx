"use client"

import { LogOut, Settings, UserRound } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { logout } from "@/actions/auth"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { UserAvatar } from "@/features/profile/components/UserAvatar"

export interface AccountMenuProps {
  userId: string
  nome: string | null
  avatar: string | null
}

// Alvo de toque de 44px (min-h-11) no mobile, foco visível e cor por token
// (hover/focus em foreground/5, sem hex) — legível nos dois temas.
const ITEM_CLASSES =
  "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-popover-foreground transition-colors outline-none hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"

/**
 * Menu de conta ancorado no avatar do header. Reusa o Popover (Radix já
 * instalado) — sem dependência nova. Gatilho = o `UserAvatar` num alvo redondo
 * de 44px rotulado ("Sua conta"); conteúdo com três itens (perfil de técnico,
 * conta, sair). O estado `open` é controlado só para fechar o menu ao navegar
 * por um `<Link>` (Escape/click-fora já são nativos do Popover).
 */
export function AccountMenu({ userId, nome, avatar }: AccountMenuProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Sua conta"
          className="flex size-11 items-center justify-center rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <UserAvatar nome={nome} avatarUrl={avatar} size={32} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Menu da conta" className="w-56 p-1.5">
        <div className="flex flex-col">
          <Link
            href={`/dashboard/ligas/tecnico/${userId}`}
            prefetch={false}
            onClick={() => setOpen(false)}
            className={ITEM_CLASSES}
          >
            <UserRound aria-hidden="true" />
            Meu perfil de técnico
          </Link>
          <Link
            href="/dashboard/conta"
            prefetch={false}
            onClick={() => setOpen(false)}
            className={ITEM_CLASSES}
          >
            <Settings aria-hidden="true" />
            Conta
          </Link>
          <div role="separator" className="my-1 h-px bg-foreground/10" />
          {/* Sair = ação irreversível (encerra a sessão): server action num
              form, alvo de 44px como os demais itens. */}
          <form action={logout}>
            <button type="submit" className={ITEM_CLASSES}>
              <LogOut aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  )
}
