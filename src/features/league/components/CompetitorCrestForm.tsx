"use client"

import { Loader2, Trash2, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  definirEscudoCompetidor,
  removerEscudoCompetidor,
} from "@/actions/escudoCompetidor"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { reduzirParaEscudo } from "@/lib/imagemCliente"

/**
 * Escudo personalizado de UM competidor, dentro da tela de Identidade da liga
 * (change escudo-personalizado-liga). Folha CLIENT — é o único ponto interativo;
 * a página segue RSC.
 *
 * O arquivo é reduzido para 256×256 no canvas ANTES de subir: cabe no limite de
 * 256KB do bucket (foto de celular não caberia) e o EXIF/GPS morre por construção.
 * O servidor revalida bytes, tipo e tamanho — o cliente não é o controle.
 */
export function CompetitorCrestForm({
  competitorId,
  seasonId,
  nome,
  escudoUrl,
  temEscudoProprio,
}: {
  competitorId: string
  seasonId: string
  nome: string
  escudoUrl: string | null
  /** Há override LOCAL — habilita "Remover" (volta ao escudo do catálogo). */
  temEscudoProprio: boolean
}) {
  const router = useRouter()
  const [salvando, salvar] = useTransition()
  const [removendo, remover] = useTransition()
  // Preview local (objectURL) enquanto a imagem escolhida não foi salva.
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ocupado = salvando || removendo

  function escolher(file: File) {
    salvar(async () => {
      const reduzida = await reduzirParaEscudo(file)
      if (!reduzida.ok) {
        toast.error(reduzida.error)
        return
      }

      // Preview imediato: o usuário vê o resultado da redução, não o original.
      const url = URL.createObjectURL(reduzida.file)
      setPreview((anterior) => {
        if (anterior) URL.revokeObjectURL(anterior)
        return url
      })

      const formData = new FormData()
      formData.append("escudo", reduzida.file)
      formData.append("seasonId", seasonId)

      const r = await definirEscudoCompetidor(competitorId, formData)
      if (r.ok) {
        toast.success("Escudo atualizado.")
        router.refresh()
      } else {
        toast.error(r.error)
        // Falhou: desfaz o preview para não mentir sobre o estado salvo.
        setPreview(null)
        URL.revokeObjectURL(url)
      }
      if (inputRef.current) inputRef.current.value = ""
    })
  }

  function limpar() {
    remover(async () => {
      const r = await removerEscudoCompetidor(competitorId, seasonId)
      if (r.ok) {
        setPreview((anterior) => {
          if (anterior) URL.revokeObjectURL(anterior)
          return null
        })
        toast.success("Escudo removido.")
        router.refresh()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <TeamCrest nome={nome} escudoUrl={preview ?? escudoUrl} size={44} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{nome}</span>
        <span className="text-muted-foreground text-xs">
          {temEscudoProprio || preview ? "Escudo próprio desta liga" : "Escudo do catálogo"}
        </span>
      </div>

      {/* Cluster de ações SEM shrink-0: a 390px ele quebra para a linha de baixo
          em vez de espremer o nome (lição da frente mobile). */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id={`escudo-${competitorId}`}
          disabled={ocupado}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) escolher(file)
          }}
        />
        <Button asChild size="sm" variant="outline" className="min-h-11 rounded-full">
          {/* label como alvo do input: mantém o clique nativo do file picker. */}
          <label htmlFor={`escudo-${competitorId}`} className="cursor-pointer">
            {salvando ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {salvando ? "Enviando…" : "Trocar"}
          </label>
        </Button>

        {temEscudoProprio ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground min-h-11 rounded-full"
            disabled={ocupado}
            onClick={limpar}
          >
            {removendo ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 aria-hidden="true" />
            )}
            <span className="sr-only">Remover escudo de {nome}</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
