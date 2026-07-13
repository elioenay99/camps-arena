"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar o PÔSTER DE TEMPORADA no WhatsApp (change add-frente-
 * compartilhavel) — wire do órfão: a rota de imagem `.../temporada/[seasonId]/imagem`
 * já existia (dono-only, inalterada), faltava o botão. Espelha
 * `CompartilharRodadaButton`: baixa o PNG e delega o gesto a `compartilharWhatsApp`;
 * o `texto` é montado no servidor (`mensagemTemporada`). Renderizado só ao DONO da
 * liga (o pôster segue dono-only).
 */
export function CompartilharTemporadaButton({
  imagemPath,
  titulo,
  texto,
}: {
  imagemPath: string
  titulo: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)

  async function baixarImagem(): Promise<File | null> {
    try {
      const res = await fetch(imagemPath, { credentials: "same-origin" })
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], "temporada.png", { type: "image/png" })
    } catch {
      return null
    }
  }

  async function aoClicar() {
    if (pendente) return
    setPendente(true)
    try {
      await compartilharWhatsApp({ texto, title: titulo, getFile: baixarImagem })
    } finally {
      setPendente(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-11 w-fit rounded-full md:h-8"
      disabled={pendente}
      onClick={aoClicar}
    >
      <Share2 aria-hidden="true" />
      {pendente ? "Preparando…" : "Compartilhar temporada"}
    </Button>
  )
}
