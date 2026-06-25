"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar a LISTA DE TIMES no WhatsApp (change add-compartilhar-lista-times) — SEM
 * imagem (text-only). A orquestração do gesto (Web Share / fallback desktop) vive em
 * `compartilharWhatsApp` (fonte única, compartilhada com o botão da rodada); aqui não há
 * `getFile`, então o share é text-only. O `texto` é montado no servidor (o celular só entra
 * embutido nos links wa.me). Lista longa: o clipboard preserva o texto íntegro mesmo se a URL
 * do wa.me for grande demais.
 */
export function CompartilharListaTimesButton({
  titulo,
  texto,
}: {
  titulo: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)
  const title = `${titulo} — Times`

  async function aoClicar() {
    if (pendente) return
    setPendente(true)
    try {
      await compartilharWhatsApp({ texto, title })
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
      {pendente ? "Preparando…" : "Compartilhar lista"}
    </Button>
  )
}
