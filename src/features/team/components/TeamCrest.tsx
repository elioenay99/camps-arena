"use client"

import * as React from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"

export interface TeamCrestProps {
  nome: string
  escudoUrl?: string | null
  /** Lado do quadrado, em px. */
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
 * Escudo do clube via `next/image`. Em ausência de URL ou erro de carregamento,
 * cai para um placeholder com iniciais + cor estável. Decorativo (`aria-hidden`):
 * o nome do clube acompanha o escudo em texto onde ele é usado.
 */
export function TeamCrest({ nome, escudoUrl, size = 24, className }: TeamCrestProps) {
  // Guarda a URL que falhou (não um booleano): assim a troca de prop reavalia
  // sozinha, durante o render. Superfícies que trocam de conteúdo no lugar (a
  // navegação entre rodadas) reaproveitam a instância — com um booleano, um
  // escudo que falhou uma vez ficaria preso nas iniciais para sempre.
  const [urlComErro, setUrlComErro] = React.useState<string | null>(null)
  const mostrarImagem = Boolean(escudoUrl) && escudoUrl !== urlComErro

  // Defesa em profundidade sobre o `onError`: lê o estado TERMINAL do elemento
  // em vez de depender de o evento ter sido disparado, ouvido e não perdido.
  // `complete && naturalWidth === 0` só é verdade para imagem que terminou de
  // carregar e falhou (carregando ainda tem `complete` falso; boa tem largura).
  const conferirFalha = React.useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0 && escudoUrl) {
        setUrlComErro(escudoUrl)
      }
    },
    [escudoUrl]
  )

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
        backgroundColor: mostrarImagem ? undefined : corDoNome(nome),
      }}
    >
      {mostrarImagem ? (
        <Image
          src={escudoUrl as string}
          alt=""
          width={size}
          height={size}
          className="size-full object-contain"
          ref={conferirFalha}
          onError={() => setUrlComErro(escudoUrl as string)}
        />
      ) : (
        <span
          className="font-semibold leading-none text-white"
          style={{ fontSize: Math.max(9, Math.round(size * 0.4)) }}
        >
          {iniciais(nome)}
        </span>
      )}
    </span>
  )
}
