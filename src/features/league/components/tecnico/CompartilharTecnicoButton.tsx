"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar o PÔSTER DO TÉCNICO no WhatsApp (change add-frente-compartilhavel)
 * — imagem + texto. Espelha `CompartilharRodadaButton`: baixa o PNG da rota do
 * técnico e delega o gesto a `compartilharWhatsApp`; o `texto` é montado no servidor
 * (`mensagemTecnico`). Renderizado só quando o técnico TEM histórico (não gera
 * "pôster de nada"). Disponível a qualquer logado (o perfil já é público a logados).
 */
export function CompartilharTecnicoButton({
  userId,
  nome,
  texto,
}: {
  userId: string
  nome: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)
  const imagemUrl = `/dashboard/ligas/tecnico/${userId}/imagem`

  async function baixarImagem(): Promise<File | null> {
    try {
      const res = await fetch(imagemUrl, { credentials: "same-origin" })
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], `tecnico-${userId}.png`, { type: "image/png" })
    } catch {
      return null
    }
  }

  async function aoClicar() {
    if (pendente) return
    setPendente(true)
    try {
      await compartilharWhatsApp({ texto, title: `${nome} — Técnico`, getFile: baixarImagem })
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
      {pendente ? "Preparando…" : "Compartilhar pôster"}
    </Button>
  )
}
