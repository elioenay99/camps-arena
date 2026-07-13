"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar a CLASSIFICAÇÃO no WhatsApp (change add-frente-compartilhavel) —
 * imagem + texto. Espelha `CompartilharRodadaButton`: baixa o PNG da rota de
 * imagem (`imagemPath`, torneio de liga OU divisão de pirâmide) e delega o gesto a
 * `compartilharWhatsApp`; o `texto` é montado no servidor (`mensagemClassificacao`).
 * Disponível a qualquer logado que enxerga a tabela (a leitura já é livre).
 */
export function CompartilharClassificacaoButton({
  imagemPath,
  titulo,
  texto,
}: {
  /** Path da rota de imagem (ex.: `/dashboard/torneios/<id>/classificacao/imagem`). */
  imagemPath: string
  titulo: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)
  const title = `${titulo} — Classificação`

  async function baixarImagem(): Promise<File | null> {
    try {
      const res = await fetch(imagemPath, { credentials: "same-origin" })
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], "classificacao.png", { type: "image/png" })
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
      {pendente ? "Preparando…" : "Compartilhar classificação"}
    </Button>
  )
}
