"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar a rodada no WhatsApp (change add-compartilhar-rodada) — imagem + texto. A
 * orquestração do gesto (Web Share / fallback desktop) vive em `compartilharWhatsApp` (fonte
 * única); aqui só baixamos o PNG da rodada sob demanda e passamos como `getFile`. O `texto` é
 * montado no servidor (o celular só entra embutido nos links wa.me).
 */
export function CompartilharRodadaButton({
  tournamentId,
  rodada,
  titulo,
  texto,
}: {
  tournamentId: string
  rodada: number
  titulo: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)
  const title = `${titulo} — Rodada ${rodada}`
  const imagemUrl = `/dashboard/torneios/${tournamentId}/rodada/${rodada}/imagem`

  async function baixarImagem(): Promise<File | null> {
    try {
      const res = await fetch(imagemUrl, { credentials: "same-origin" })
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], `rodada-${rodada}.png`, { type: "image/png" })
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
      className="rounded-full bg-green-700 text-white hover:bg-green-800"
      disabled={pendente}
      onClick={aoClicar}
    >
      <Share2 aria-hidden="true" />
      {pendente ? "Preparando…" : `Compartilhar rodada ${rodada}`}
    </Button>
  )
}
