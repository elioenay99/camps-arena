"use client"

import * as React from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TournamentStatus } from "@/lib/supabase/database.types"
import { useDemoStore, usePerfilFlags } from "@/features/demo/store/useDemoStore"

import { CardVitrineDemo, VitrineVaziaDemo } from "./CardVitrineDemo"

const POR_PAGINA = 6
type Ordem = "recentes" | "nome" | "competidores"

export function DemoExplorar() {
  const { state, dispatch } = useDemoStore()
  const flags = usePerfilFlags()
  const [busca, setBusca] = React.useState("")
  const [tipo, setTipo] = React.useState<"todos" | "liga" | "torneio">("todos")
  const [status, setStatus] = React.useState<TournamentStatus | "todos">("todos")
  const [ordem, setOrdem] = React.useState<Ordem>("recentes")
  const [incluirNaoListadas, setIncluirNaoListadas] = React.useState(false)
  const [pagina, setPagina] = React.useState(0)

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const arr = state.vitrine.filter((v) => {
      if (!incluirNaoListadas && !v.listado) return false
      const casaTexto = termo === "" || v.nome.toLowerCase().includes(termo)
      const casaTipo = tipo === "todos" || v.tipo === tipo
      const casaStatus = status === "todos" || v.status === status
      return casaTexto && casaTipo && casaStatus
    })
    arr.sort((a, b) => {
      if (ordem === "nome") return a.nome.localeCompare(b.nome)
      if (ordem === "competidores") return b.competidores - a.competidores
      return Date.parse(b.criadoEm) - Date.parse(a.criadoEm)
    })
    return arr
  }, [state.vitrine, busca, tipo, status, ordem, incluirNaoListadas])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(
    paginaAtual * POR_PAGINA,
    paginaAtual * POR_PAGINA + POR_PAGINA
  )

  // Reseta a paginação sempre que um critério muda (evita página órfã).
  function comReset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v)
      setPagina(0)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl font-bold">Explorar</h1>
        <p className="text-sm text-muted-foreground">
          Vitrine pública das competições. Alterne “listar” para controlar o que
          aparece (otimista, só nesta demonstração).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[10rem]">
          <span className="sr-only">Buscar competição</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => comReset(setBusca)(e.target.value)}
            placeholder="Buscar por nome"
            className="pl-8"
          />
        </label>
        <select
          value={tipo}
          onChange={(e) => comReset(setTipo)(e.target.value as "todos" | "liga" | "torneio")}
          aria-label="Filtrar por tipo"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="todos">Todos os tipos</option>
          <option value="liga">Pirâmides</option>
          <option value="torneio">Torneios</option>
        </select>
        <select
          value={status}
          onChange={(e) => comReset(setStatus)(e.target.value as TournamentStatus | "todos")}
          aria-label="Filtrar por status"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="encerrado">Encerrado</option>
          <option value="rascunho">Rascunho</option>
        </select>
        <select
          value={ordem}
          onChange={(e) => comReset(setOrdem)(e.target.value as Ordem)}
          aria-label="Ordenar"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="recentes">Mais recentes</option>
          <option value="nome">Nome (A–Z)</option>
          <option value="competidores">Mais competidores</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={incluirNaoListadas}
          onChange={(e) => comReset(setIncluirNaoListadas)(e.target.checked)}
          className="size-4"
        />
        Incluir competições não listadas
      </label>

      {visiveis.length === 0 ? (
        <VitrineVaziaDemo />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {visiveis.map((item) => (
            <CardVitrineDemo
              key={item.id}
              item={item}
              onToggleListar={
                flags.podeGerir
                  ? () => dispatch({ type: "TOGGLE_LISTAR", id: item.id })
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {totalPaginas > 1 ? (
        <nav
          aria-label="Paginação da vitrine"
          className="flex items-center justify-center gap-3 text-sm"
        >
          <Button
            size="sm"
            variant="outline"
            disabled={paginaAtual === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {paginaAtual + 1} / {totalPaginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={paginaAtual >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            Próxima
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
