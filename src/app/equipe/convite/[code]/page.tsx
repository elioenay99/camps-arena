import { CircleCheck, ShieldAlert, ShieldCheck, Ticket } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { AcceptTeamInviteForm } from "@/features/team-roles/components/AcceptTeamInviteForm"
import { createClient } from "@/lib/supabase/server"
import {
  ConviteShell,
  EstadoBloqueio,
  HeroIcone,
  PainelConvite,
} from "@/app/convite/[codigo]/convite-ui"

// Título genérico de propósito: o nome do campeonato só aparece no corpo, para
// quem TEM o código — metadata vaza em preview de link/history sem custo.
export const metadata: Metadata = {
  title: "Convite de equipe · Goliseu",
}

const LABEL_INVALIDO =
  "Convite inválido ou expirado. Peça um novo link a quem organiza o campeonato."

const ROTULO_PAPEL: Record<string, string> = {
  arbitro: "árbitro",
  moderador: "moderador",
  admin: "administrador",
}

/**
 * Página PÚBLICA do convite de EQUIPE (o código na URL é a credencial). Esta
 * rota fica FORA de /dashboard — o proxy não a protege; a própria page valida a
 * sessão. Deslogado: CTAs de login/cadastro com retorno para cá. Logado:
 * preview via `info_convite_membro` (security definer — o campeonato pode ser
 * privado e invisível até o aceite) + aceite explícito.
 */
export default async function ConviteEquipePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let conteudo: React.ReactNode

  if (!user) {
    const retorno = encodeURIComponent(`/equipe/convite/${code}`)
    conteudo = (
      <PainelConvite>
        <HeroIcone icon={Ticket} />
        <p className="text-muted-foreground text-sm">
          Entre na sua conta (ou crie uma) para ver o convite e entrar na equipe
          do campeonato.
        </p>
        <div className="grid gap-2">
          <Button asChild>
            <Link href={`/login?redirectTo=${retorno}`}>Entrar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/cadastro?redirectTo=${retorno}`}>Criar conta</Link>
          </Button>
        </div>
      </PainelConvite>
    )
  } else {
    const { data, error } = await supabase.rpc("info_convite_membro", {
      p_code: code,
    })
    if (error) {
      throw new Error(`Falha ao carregar o convite: ${error.message}`)
    }
    const info = data?.[0] ?? null

    if (!info) {
      conteudo = <AvisoInvalido />
    } else {
      const titulo = info.titulo?.trim() || "um campeonato"
      const papel = ROTULO_PAPEL[info.papel] ?? "membro"
      const destino =
        info.escopo === "league"
          ? `/dashboard/ligas/${info.alvo_id}`
          : `/dashboard/torneios/${info.alvo_id}`

      if (info.ja_membro) {
        conteudo = (
          <PainelConvite>
            <HeroIcone icon={CircleCheck} />
            <p className="text-sm" role="status">
              {`Você já faz parte da equipe de "${titulo}".`}
            </p>
            <Button asChild>
              <Link href={destino}>Abrir o campeonato</Link>
            </Button>
          </PainelConvite>
        )
      } else {
        conteudo = (
          <PainelConvite>
            <HeroIcone icon={ShieldCheck} />
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-xl font-bold tracking-tight">
                {titulo}
              </span>
              <p className="text-muted-foreground text-sm">
                Você foi convidado para entrar como{" "}
                <span className="text-foreground font-semibold">{papel}</span>{" "}
                na equipe deste campeonato.
              </p>
            </div>
            <AcceptTeamInviteForm code={code} />
          </PainelConvite>
        )
      }
    }
  }

  return <ConviteShell>{conteudo}</ConviteShell>
}

function AvisoInvalido() {
  return <EstadoBloqueio icon={ShieldAlert}>{LABEL_INVALIDO}</EstadoBloqueio>
}
