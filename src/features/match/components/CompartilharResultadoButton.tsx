"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar o RESULTADO de uma partida encerrada no WhatsApp (change
 * add-frente-compartilhavel) — imagem + texto. Espelha `CompartilharRodadaButton`:
 * a orquestração do gesto vive em `compartilharWhatsApp` (fonte única); aqui só
 * baixamos o PNG do resultado sob demanda (`getFile`) e passamos o `texto` montado
 * no servidor (`mensagemResultado`). Disponível a qualquer logado que enxerga a
 * partida (a imagem é auth-gated + RLS; nunca revela mais do que a página).
 */
export function CompartilharResultadoButton({
  tournamentId,
  matchId,
  nome1,
  nome2,
  texto,
}: {
  tournamentId: string
  matchId: string
  nome1: string
  nome2: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)
  const title = `${nome1} x ${nome2}`
  const imagemUrl = `/dashboard/torneios/${tournamentId}/partida/${matchId}/imagem`

  async function baixarImagem(): Promise<File | null> {
    try {
      const res = await fetch(imagemUrl, { credentials: "same-origin" })
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], `resultado-${matchId}.png`, { type: "image/png" })
    } catch {
      return null
    }
  }

  async function aoClicar() {
    if (pendente) return
    setPendente(true)
    try {
      await compartilharWhatsApp({ texto, title, getFile: baixarImagem })
    } finally {
      setPendente(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-11 rounded-full md:h-8"
      disabled={pendente}
      onClick={aoClicar}
    >
      <Share2 aria-hidden="true" />
      {pendente ? "Preparando…" : "Compartilhar resultado"}
    </Button>
  )
}
