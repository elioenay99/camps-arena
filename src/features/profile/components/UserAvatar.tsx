"use client"

import * as React from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"

export interface UserAvatarProps {
  nome: string | null | undefined
  avatarUrl?: string | null
  /** Lado do círculo, em px. */
  size?: number
  className?: string
}

function iniciais(nome: string) {
  const limpo = nome.trim()
  if (!limpo) return "?"
  return limpo
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => [...parte][0]?.toUpperCase() ?? "")
    .join("")
}

/** Cor estável (HSL) derivada do nome, para o placeholder. */
function corDoNome(nome: string) {
  let h = 0
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 45% 32%)`
}

/**
 * Identidade visual de uma PESSOA (distinto do `TeamCrest`, que é de clube).
 * Com foto, renderiza a imagem recortada em círculo via `next/image`; sem foto
 * ou em erro de carregamento, cai para iniciais + cor estável do nome.
 * Decorativo (`aria-hidden`): o nome acompanha em texto onde for usado.
 */
export function UserAvatar({
  nome,
  avatarUrl,
  size = 28,
  className,
}: UserAvatarProps) {
  const [erro, setErro] = React.useState(false)
  const nomeSeguro = nome?.trim() || "Sem nome"
  const mostrarImagem = Boolean(avatarUrl) && !erro

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: mostrarImagem ? undefined : corDoNome(nomeSeguro),
      }}
    >
      {mostrarImagem ? (
        <Image
          src={avatarUrl as string}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setErro(true)}
        />
      ) : (
        <span
          className="font-semibold leading-none text-white"
          style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}
        >
          {iniciais(nomeSeguro)}
        </span>
      )}
    </span>
  )
}
