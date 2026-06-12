"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { atualizarAvatar, removerAvatar } from "@/actions/profile"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { Button } from "@/components/ui/button"

const MAX_BYTES = 2 * 1024 * 1024

/**
 * Foto de perfil: mostra o avatar atual (ou o preview local antes de enviar),
 * escolhe um arquivo, envia ao bucket via Server Action e troca/remove. A
 * autorização real é a action + RLS de storage; os botões são UX. O preview
 * local usa `<img>` (blob URL não passa pelo otimizador do next/image).
 */
export function AvatarUpload({
  nome,
  avatarUrl,
}: {
  nome: string | null
  avatarUrl: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  function selecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith("image/")) {
      toast.error("Selecione uma imagem (PNG, JPG, WEBP ou GIF).")
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error("A imagem deve ter no máximo 2MB.")
      return
    }
    setArquivo(f)
    setPreview(URL.createObjectURL(f))
  }

  function limpar() {
    setArquivo(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function enviar() {
    if (!arquivo) return
    const fd = new FormData()
    fd.set("avatar", arquivo)
    startTransition(async () => {
      const r = await atualizarAvatar(fd)
      if (r.ok) {
        toast.success("Foto atualizada.")
        limpar()
      } else {
        toast.error(r.error)
      }
    })
  }

  function remover() {
    startTransition(async () => {
      const r = await removerAvatar()
      if (r.ok) {
        toast.success("Foto removida.")
        limpar()
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {preview ? (
        <span
          aria-hidden="true"
          className="ring-foreground/20 inline-flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="size-full object-cover" />
        </span>
      ) : (
        <UserAvatar
          nome={nome}
          avatarUrl={avatarUrl}
          size={64}
          className="ring-foreground/20 ring-2"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={selecionar}
        className="hidden"
        aria-label="Escolher foto de perfil"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => inputRef.current?.click()}
        >
          {avatarUrl || preview ? "Trocar foto" : "Escolher foto"}
        </Button>
        {arquivo ? (
          <>
            <Button type="button" size="sm" disabled={pendente} onClick={enviar}>
              {pendente ? "Enviando…" : "Enviar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendente}
              onClick={limpar}
            >
              Cancelar
            </Button>
          </>
        ) : avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={remover}
          >
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  )
}
