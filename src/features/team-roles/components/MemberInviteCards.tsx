"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { gerarConviteMembro, removerConviteMembro } from "@/actions/equipe"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"
import type { ConviteMembro } from "@/features/team-roles/data/getConvitesMembro"
import type { Escopo, PapelConvite } from "@/schema/equipe"

/** Só árbitro/moderador são ofertáveis por link — admin nunca sai por convite. */
const PAPEIS: { papel: PapelConvite; rotulo: string; descricao: string }[] = [
  {
    papel: "arbitro",
    rotulo: "Árbitro",
    descricao: "Quem abrir este link (logado) entra como árbitro: registra placares, W.O. e libera rodadas.",
  },
  {
    papel: "moderador",
    rotulo: "Moderador",
    descricao: "Quem abrir este link (logado) entra como moderador: cuida de convites, vagas e participantes.",
  },
]

function urlConvite(code: string): string {
  return `${env.NEXT_PUBLIC_SITE_URL}/equipe/convite/${code}`
}

/**
 * Gestão dos LINKS de convite por papel (árbitro/moderador). Um cartão por
 * papel: se há link vivo, exibe-o com Copiar + Gerar novo + Revogar; senão,
 * oferece gerar o primeiro. Os botões são UX; a barreira real é action + RLS.
 * O `revalidatePath` das actions atualiza a página após cada operação.
 */
export function MemberInviteCards({
  escopo,
  alvoId,
  convites,
}: {
  escopo: Escopo
  alvoId: string
  convites: ConviteMembro[]
}) {
  const porPapel = new Map(convites.map((c) => [c.papel, c.code]))

  return (
    <section aria-labelledby="convites-titulo" className="flex flex-col gap-4">
      <h2 id="convites-titulo" className="text-lg font-semibold">
        Links de convite
      </h2>
      <p className="text-muted-foreground text-sm">
        Cada papel tem um link próprio. Gerar um novo invalida o anterior.
      </p>

      <div className="grid gap-3">
        {PAPEIS.map(({ papel, rotulo, descricao }) => (
          <CartaoConvite
            key={papel}
            escopo={escopo}
            alvoId={alvoId}
            papel={papel}
            rotulo={rotulo}
            descricao={descricao}
            code={porPapel.get(papel) ?? null}
          />
        ))}
      </div>
    </section>
  )
}

function CartaoConvite({
  escopo,
  alvoId,
  papel,
  rotulo,
  descricao,
  code,
}: {
  escopo: Escopo
  alvoId: string
  papel: PapelConvite
  rotulo: string
  descricao: string
  code: string | null
}) {
  const [pendente, startTransition] = useTransition()
  const url = code ? urlConvite(code) : null

  function gerar() {
    startTransition(async () => {
      const r = await gerarConviteMembro(escopo, alvoId, papel)
      if (r.ok) {
        toast.success(
          code
            ? "Novo link gerado. O anterior deixou de valer."
            : "Link de convite gerado."
        )
      } else {
        toast.error(r.error)
      }
    })
  }

  function revogar() {
    startTransition(async () => {
      const r = await removerConviteMembro(escopo, alvoId, papel)
      if (r.ok) toast.success("Link revogado.")
      else toast.error(r.error)
    })
  }

  async function copiar() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado.")
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie o link manualmente.")
    }
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 ${url ? "" : "border-dashed"}`}
    >
      <h3 className="text-sm font-semibold">{rotulo}</h3>
      <p className="text-muted-foreground text-sm">{descricao}</p>

      {url ? (
        <>
          <p className="bg-muted min-w-0 truncate rounded-md px-3 py-2 font-mono text-sm">
            {url}
          </p>
          {/* gap generoso ao redor de "Gerar novo"/"Revogar" (irreversíveis). */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Button
              type="button"
              size="sm"
              className="min-h-10 px-4"
              onClick={copiar}
            >
              Copiar link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-10 px-4"
              disabled={pendente}
              onClick={gerar}
            >
              {pendente ? "Gerando…" : "Gerar novo link"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-10 px-4"
              disabled={pendente}
              onClick={revogar}
            >
              {pendente ? "Revogando…" : "Revogar"}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            className="min-h-10 px-4"
            disabled={pendente}
            onClick={gerar}
          >
            {pendente ? "Gerando…" : "Gerar link"}
          </Button>
        </div>
      )}
    </div>
  )
}
