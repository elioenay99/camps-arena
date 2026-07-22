import { ChevronRight, ListOrdered, Settings2, Trophy } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { champThemeProps } from "@/features/championship/championshipTheme"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { CupLifecycleActions, NovaEdicaoButton } from "@/features/cup/components/CupActions"
import { CupRulesPanel } from "@/features/cup/components/CupRulesPanel"
import { CupSeasonStatusPill } from "@/features/cup/components/CupSeasonStatusPill"
import { CupStatusPill } from "@/features/cup/components/CupStatusPill"
import {
  CUP_FORMAT_LABEL,
  CUP_SCOPE_LABEL,
} from "@/features/cup/cupLabels"
import { getCup } from "@/features/cup/data/getCup"
import { getCups } from "@/features/cup/data/getCups"
import { getCompetitions } from "@/features/league/data/getCompetitions"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const fallback = { title: "Copa · Goliseu" }
  if (!z.uuid().safeParse(id).success) return fallback
  const copa = await getCup(id)
  const nome = copa?.nome.trim()
  return nome ? { title: `${nome} · Goliseu` } : fallback
}

/** Chip de metadado (espelha a página do torneio). */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}

export default async function CopaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?redirectTo=/dashboard/copas/${id}`)
  }

  const copa = await getCup(id)
  if (!copa) {
    notFound()
  }

  const ehDono = copa.criadaPor !== null && copa.criadaPor === user.id

  // Origens disponíveis para o painel de regras (dono): pirâmides + copas dele,
  // exceto a própria copa (não pode se auto-alimentar).
  const [piramidesRaw, copasRaw] = ehDono
    ? await Promise.all([getCompetitions(user.id), getCups(user.id)])
    : [[], []]
  const origensPiramide = piramidesRaw
    .filter((p) => p.numDivisoes > 0)
    .map((p) => ({ id: p.id, nome: p.nome.trim() || "Pirâmide", numNiveis: p.numDivisoes }))
  const origensCopa = copasRaw
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, nome: c.nome.trim() || "Copa" }))

  const titulo = copa.nome.trim() || "Copa"
  const themeProps = champThemeProps(copa.corPrimaria, copa.corSecundaria)

  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10",
        themeProps?.className
      )}
      style={themeProps?.style}
    >
      <header className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <ChampionshipBadge
            icon={<Trophy className="size-6" />}
            primary={copa.corPrimaria}
            secondary={copa.corSecundaria}
            className="size-12 rounded-xl ring-1 ring-primary/20"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight break-words sm:text-3xl">
              {titulo}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <CupStatusPill status={copa.status} />
              <Chip>{CUP_SCOPE_LABEL[copa.abrangencia]}</Chip>
              <Chip>{CUP_FORMAT_LABEL[copa.formato]}</Chip>
              {copa.porNome ? <Chip>por nome</Chip> : <Chip>por clube</Chip>}
              {copa.idaEVolta ? <Chip>ida e volta</Chip> : null}
              {copa.terceiroLugar ? <Chip>3º lugar</Chip> : null}
            </div>
          </div>
        </div>
        {ehDono ? (
          <div className="shrink-0">
            <NovaEdicaoButton cupId={id} />
          </div>
        ) : null}
      </header>

      {/* Edições. */}
      <section aria-labelledby="edicoes-titulo" className="flex flex-col gap-4">
        <h2
          id="edicoes-titulo"
          className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
        >
          <ListOrdered className="text-primary size-4.5" aria-hidden="true" />
          Edições
        </h2>
        {copa.edicoes.length === 0 ? (
          <div className="bg-muted/10 flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
            <span
              aria-hidden="true"
              className="bg-primary/8 text-primary/70 flex size-11 items-center justify-center rounded-full"
            >
              <Trophy className="size-5" />
            </span>
            <p className="text-muted-foreground max-w-xs text-sm">
              {ehDono
                ? "Abra a primeira edição para derivar as vagas e montar a chave."
                : "Esta copa ainda não tem edições."}
            </p>
          </div>
        ) : (
          <ul className="grid list-none gap-2.5 p-0">
            {copa.edicoes.map((e) => (
              <li key={e.id}>
                {/* Sem prefetch: a lista de edições prefetcharia N rotas
                    copas/edicao/[id] (bracket + classificação, RSC caras) de uma
                    vez; a rajada estourava a borda da Vercel (503). Ver
                    add-dashboard-prefetch-hardening. */}
                <Link
                  href={`/dashboard/copas/edicao/${e.id}`}
                  prefetch={false}
                  className="elevate-hover group flex items-center gap-3.5 rounded-xl border bg-card/80 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="font-display bg-primary/10 text-primary ring-primary/15 flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ring-1"
                  >
                    {e.numero}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">Edição {e.numero}</span>
                    <span className="text-muted-foreground text-xs">
                      {e.encerradaEm
                        ? "Concluída"
                        : e.montadaEm
                          ? "Em andamento"
                          : "Em preparação"}
                    </span>
                  </span>
                  <CupSeasonStatusPill status={e.status} />
                  <ChevronRight
                    aria-hidden="true"
                    className="text-muted-foreground/40 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Regras de qualificação — painel de edição só para o dono; leitura para todos. */}
      <section aria-labelledby="regras-titulo" className="flex flex-col gap-4">
        <h2
          id="regras-titulo"
          className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
        >
          <Settings2 className="text-primary size-4.5" aria-hidden="true" />
          Regras de qualificação
        </h2>
        {ehDono ? (
          <CupRulesPanel
            cupId={id}
            regras={copa.regras}
            piramides={origensPiramide}
            copas={origensCopa}
          />
        ) : copa.regras.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
            Sem regras de qualificação.
          </p>
        ) : (
          <ul className="grid list-none gap-2 p-0">
            {copa.regras.map((r) => {
              const ehTodos = r.origemTipo === "divisao_todos"
              const numVagas =
                r.posicaoInicio != null && r.posicaoFim != null
                  ? Math.max(0, r.posicaoFim - r.posicaoInicio + 1)
                  : 0
              const ehDivisaoOrigem =
                r.origemTipo === "divisao" || r.origemTipo === "divisao_todos"
              const origem = ehDivisaoOrigem
                ? `${r.origemNome ?? "Pirâmide"}${r.origemNivel != null ? ` · nível ${r.origemNivel}` : ""}${ehTodos ? " · todos os clubes" : ""}`
                : (r.origemNome ?? "Copa")
              return (
                <li
                  key={r.id}
                  className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{r.rotulo?.trim() || origem}</span>
                    <span className="text-muted-foreground block text-xs">
                      {ehTodos
                        ? `${origem} · divisão inteira (temporada em disputa)`
                        : `${origem} · ${r.posicaoInicio}º a ${r.posicaoFim}º (${numVagas} ${numVagas === 1 ? "vaga" : "vagas"})`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Administração da copa = dono: arquivar / apagar. */}
      {ehDono ? (
        <section
          aria-labelledby="admin-titulo"
          className="mt-2 flex flex-col gap-3 border-t pt-6"
        >
          <h2
            id="admin-titulo"
            className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            Administração da copa
          </h2>
          <CupLifecycleActions cupId={id} arquivada={copa.status === "arquivada"} />
        </section>
      ) : null}
    </main>
  )
}
