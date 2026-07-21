"use client"

import * as React from "react"
import { toast } from "sonner"

import { adicionarMembro, buscarUsuarios, type UsuarioBusca } from "@/actions/equipe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNative } from "@/components/ui/select-native"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type { Escopo, PapelMembro } from "@/schema/equipe"
import { cn } from "@/lib/utils"

const DEBOUNCE_MS = 350
const MIN_CHARS = 2

// Select nativo (o projeto não usa shadcn Select), com os tokens do design.
type OpcaoPapel = { value: PapelMembro; label: string }

const OPCOES_PAPEL: OpcaoPapel[] = [
  { value: "moderador", label: "Moderador" },
  { value: "arbitro", label: "Árbitro" },
  { value: "admin", label: "Admin" },
]

/**
 * Nomeação DIRETA de um membro: combobox acessível de pessoas (busca por nome,
 * via `buscarUsuarios`, mín. 2 chars, debounce) + seletor de papel + "Adicionar"
 * (`adicionarMembro`). O papel "admin" só aparece no seletor para o DONO (a RLS
 * de admin exige dono — a action devolve mensagem precisa se um não-dono tentar,
 * mas escondemos a opção para evitar o clique fadado). O `revalidatePath` da
 * action atualiza a equipe após sucesso.
 */
export function AddMemberSearch({
  escopo,
  alvoId,
  ehDono,
}: {
  escopo: Escopo
  alvoId: string
  ehDono: boolean
}) {
  const baseId = React.useId()
  const listboxId = `${baseId}-listbox`
  const papelId = `${baseId}-papel`

  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<UsuarioBusca[]>([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [highlight, setHighlight] = React.useState(-1)
  const [selecionado, setSelecionado] = React.useState<UsuarioBusca | null>(null)
  const [papel, setPapel] = React.useState<PapelMembro>("moderador")
  const [enviando, startTransition] = React.useTransition()

  const reqId = React.useRef(0)
  const skipSearch = React.useRef(false)
  const blurTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const opcoes = React.useMemo(
    () => (ehDono ? OPCOES_PAPEL : OPCOES_PAPEL.filter((o) => o.value !== "admin")),
    [ehDono]
  )

  // Debounce + busca com guarda de corrida (descarta respostas obsoletas).
  React.useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false
      return
    }
    const q = query.trim()
    const id = ++reqId.current
    const t = setTimeout(
      async () => {
        if (q.length < MIN_CHARS) {
          if (id !== reqId.current) return
          setResults([])
          setLoading(false)
          return
        }
        setLoading(true)
        const r = await buscarUsuarios(q)
        if (id !== reqId.current) return
        setLoading(false)
        setOpen(true)
        setResults(r)
        setHighlight(r.length > 0 ? 0 : -1)
      },
      q.length < MIN_CHARS ? 0 : DEBOUNCE_MS
    )
    return () => clearTimeout(t)
  }, [query])

  React.useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current)
    }
  }, [])

  function escolher(u: UsuarioBusca) {
    skipSearch.current = true
    setSelecionado(u)
    setQuery(u.nome?.trim() || "Sem nome")
    setResults([])
    setOpen(false)
    setHighlight(-1)
  }

  function limparSelecao() {
    setSelecionado(null)
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
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
  }

  function adicionar() {
    if (!selecionado) return
    const alvoUser = selecionado.id
    const nome = selecionado.nome?.trim() || "A pessoa"
    startTransition(async () => {
      const r = await adicionarMembro(escopo, alvoId, alvoUser, papel)
      if (r.ok) {
        toast.success(`${nome} entrou na equipe.`)
        setSelecionado(null)
        setQuery("")
        setResults([])
        setPapel("moderador")
      } else {
        toast.error(r.error)
      }
    })
  }

  const mostrarLista = open && (loading || results.length > 0)

  return (
    <section aria-labelledby="nomear-titulo" className="flex flex-col gap-4">
      <h2 id="nomear-titulo" className="text-lg font-semibold">
        Adicionar à equipe
      </h2>
      <p className="text-muted-foreground text-sm">
        Busque a pessoa pelo nome e escolha o papel dela na gestão.
      </p>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="relative grid gap-2">
          <Label htmlFor={baseId}>Pessoa</Label>
          <Input
            id={baseId}
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              highlight >= 0 && results[highlight]
                ? `${baseId}-opt-${highlight}`
                : undefined
            }
            autoComplete="off"
            placeholder="Buscar pessoa…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              // Digitar de novo invalida a seleção anterior.
              if (selecionado) limparSelecao()
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
              className="bg-popover text-popover-foreground absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-md border p-1 shadow-md"
              onMouseDown={(e) => {
                e.preventDefault()
                if (blurTimer.current) clearTimeout(blurTimer.current)
              }}
            >
              {loading ? (
                <p
                  className="text-muted-foreground px-2 py-2 text-sm"
                  role="status"
                  aria-live="polite"
                >
                  Buscando…
                </p>
              ) : (
                <ul
                  id={listboxId}
                  role="listbox"
                  aria-label="Pessoas encontradas"
                  className="contents"
                >
                  {results.map((u, i) => {
                    const nome = u.nome?.trim() || "Sem nome"
                    return (
                      <li
                        key={u.id}
                        id={`${baseId}-opt-${i}`}
                        role="option"
                        aria-selected={i === highlight}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                          i === highlight
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50"
                        )}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => escolher(u)}
                      >
                        <UserAvatar nome={u.nome} avatarUrl={u.avatar} size={24} />
                        <span className="truncate">{nome}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 sm:w-40">
          <Label htmlFor={papelId}>Papel</Label>
          <SelectNative
            id={papelId}
            className="md:h-10"
            value={papel}
            onChange={(e) => setPapel(e.target.value as PapelMembro)}
          >
            {opcoes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectNative>
        </div>
      </div>

      <div>
        <Button
          type="button"
          className="min-h-11 w-full px-4 sm:w-auto"
          disabled={!selecionado || enviando}
          onClick={adicionar}
        >
          {enviando ? "Adicionando…" : "Adicionar à equipe"}
        </Button>
      </div>
    </section>
  )
}
