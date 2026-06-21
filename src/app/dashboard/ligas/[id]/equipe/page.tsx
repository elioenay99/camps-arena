import { ArrowLeft, Users } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AddMemberSearch } from "@/features/team-roles/components/AddMemberSearch"
import { MemberInviteCards } from "@/features/team-roles/components/MemberInviteCards"
import { TeamSection } from "@/features/team-roles/components/TeamSection"
import { getConvitesMembro } from "@/features/team-roles/data/getConvitesMembro"
import { getMembros } from "@/features/team-roles/data/getMembros"
import { podeGerir } from "@/lib/autorizacao"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Equipe da liga · Goliseu",
}

export default async function EquipeDaLigaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // uuid validado ANTES da query: lixo de URL vira 404, não erro 22P02.
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Defesa em profundidade: além do proxy, a RSC valida a sessão.
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/ligas/${id}/equipe`)
  }

  // Gate por CAPACIDADE: só quem gere (dono/admin) vê os bastidores da equipe.
  // Sem capacidade → o MESMO 404 (sem oráculo). A autorização real é action+RLS.
  if (!(await podeGerir(supabase, { competitionId: id }))) {
    notFound()
  }

  // Carrega a competição (nome + dono) e a equipe. `created_by` define ehDono e
  // permite mostrar o dono coroado no topo da lista (ele não tem linha em
  // league_members).
  const { data: competicao, error } = await supabase
    .from("league_competitions")
    .select("nome, created_by")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    throw new Error(`Falha ao carregar a competição: ${error.message}`)
  }
  if (!competicao) {
    notFound()
  }

  const [membros, convites] = await Promise.all([
    getMembros(supabase, "league", id),
    getConvitesMembro(supabase, "league", id),
  ])

  const donoId = competicao.created_by
  const ehDono = donoId === user.id

  // Perfil do dono para o cabeçalho coroado (best-effort: sem perfil, cai para
  // "Sem nome" no UserAvatar). Só consulta quando há dono conhecido.
  let dono: { userId: string; nome: string | null; avatar: string | null } | null = null
  if (donoId) {
    const { data: perfil } = await supabase
      .from("users_public")
      .select("nome, avatar")
      .eq("id", donoId)
      .maybeSingle()
    dono = { userId: donoId, nome: perfil?.nome ?? null, avatar: perfil?.avatar ?? null }
  }

  const nome = competicao.nome.trim() || "Liga"

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-10">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2 w-fit rounded-full"
      >
        <Link href={`/dashboard/ligas/${id}`}>
          <ArrowLeft aria-hidden="true" />
          Voltar à temporada
        </Link>
      </Button>

      <Card className="elevate">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="bg-primary/10 text-primary ring-primary/20 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1"
            >
              <Users className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <CardTitle className="font-display text-xl">Equipe</CardTitle>
              <CardDescription className="truncate">{nome}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          <TeamSection
            escopo="league"
            alvoId={id}
            membros={membros}
            userId={user.id}
            ehDono={ehDono}
            podeGerir
            dono={dono}
          />
          <MemberInviteCards escopo="league" alvoId={id} convites={convites} />
          <AddMemberSearch escopo="league" alvoId={id} ehDono={ehDono} />
        </CardContent>
      </Card>
    </main>
  )
}
