"use client"

import * as React from "react"

import { searchTeams } from "@/actions/teams"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import type { TeamResult } from "@/schema/teamSchema"
import { cn } from "@/lib/utils"

export interface TeamSearchInputProps {
  label?: string
  placeholder?: string
  onSelect: (team: TeamResult) => void
  className?: string
}

const DEBOUNCE_MS = 350

/**
 * Autocomplete de clube real (combobox acessível). Faz debounce e chama a
 * Server Action `searchTeams`; o consumidor recebe o clube via `onSelect`
 * (a persistência/associação fica a cargo do formulário que o usa).
 */
export function TeamSearchInput({
  label = "Clube",
  placeholder = "Buscar clube…",
  onSelect,
  className,
}: TeamSearchInputProps) {
  const baseId = React.useId()
  const listboxId = `${baseId}-listbox`

  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<TeamResult[]>([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [highlight, setHighlight] = React.useState(-1)

  const reqId = React.useRef(0)
  const skipSearch = React.useRef(false)
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce + busca, com guarda de corrida (ignora respostas obsoletas).
  // Todos os setState ficam DENTRO do timeout (assíncronos) — evita setState
  // síncrono no corpo do effect.
  React.useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false
      return
    }
    const q = query.trim()
    const id = ++reqId.current
    const t = setTimeout(async () => {
      if (q.length < 3) {
        if (id !== reqId.current) return
        setResults([])
        setErro(null)
        setLoading(false)
        return
      }
      setLoading(true)
      const r = await searchTeams(q)
      if (id !== reqId.current) return // resposta obsoleta — descarta
      setLoading(false)
      setOpen(true)
      if (r.ok) {
        setResults(r.teams)
        setErro(null)
        setHighlight(r.teams.length > 0 ? 0 : -1)
      } else {
        setResults([])
        setErro(r.error)
        setHighlight(-1)
      }
    }, q.length < 3 ? 0 : DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  // Cancela o timer de blur pendente ao desmontar (evita setState fora da árvore).
  React.useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current)
    }
  }, [])

  function escolher(team: TeamResult) {
    skipSearch.current = true
    onSelect(team)
    setQuery(team.nome)
    setResults([])
    setErro(null)
    setOpen(false)
    setHighlight(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open && results.length > 0) setOpen(true)
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      if (open && highlight >= 0 && results[highlight]) {
        e.preventDefault()
        escolher(results[highlight])
      }
    } else if (e.key === "Escape") {
      if (open) {
        // Fecha só o autocomplete; não deixa o Escape fechar o Dialog pai.
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
  }

  const mostrarLista = open && (loading || erro !== null || results.length > 0)

  return (
    <div className={cn("relative grid gap-2", className)}>
      <Label htmlFor={baseId}>{label}</Label>
      <Input
        id={baseId}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          highlight >= 0 && results[highlight] ? `${baseId}-opt-${highlight}` : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (results.length > 0) setOpen(true)
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120)
        }}
      />

      {mostrarLista ? (
        <div
          className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          onMouseDown={(e) => {
            // impede o blur do input antes do clique na opção
            e.preventDefault()
            if (blurTimer.current) clearTimeout(blurTimer.current)
          }}
        >
          {loading ? (
            <p
              className="px-2 py-2 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Buscando…
            </p>
          ) : erro ? (
            <p className="px-2 py-2 text-sm text-destructive" role="alert">
              {erro}
            </p>
          ) : results.length === 0 ? (
            <p
              className="px-2 py-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              Nenhum clube encontrado.
            </p>
          ) : (
            // role=listbox só contém role=option (estados ficam fora).
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Clubes encontrados"
              className="contents"
            >
              {results.map((team, i) => (
                <li
                  key={team.externalId}
                  id={`${baseId}-opt-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                    i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => escolher(team)}
                >
                  <TeamCrest nome={team.nome} escudoUrl={team.escudoUrl} size={20} />
                  <span className="truncate">{team.nome}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
