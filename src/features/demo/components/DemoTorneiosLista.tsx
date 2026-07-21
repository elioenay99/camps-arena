"use client"

import * as React from "react"
import Link from "next/link"
import { Pencil, Plus, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SelectNative } from "@/components/ui/select-native"
import type { TournamentFormat, TournamentStatus } from "@/lib/supabase/database.types"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { StatusPill } from "@/features/tournament/components/StatusPill"
import { FORMATO_META } from "@/features/tournament/formatoMeta"
import { useDemoStore, usePerfilFlags } from "@/features/demo/store/useDemoStore"
import type { TorneioDemo } from "@/features/demo/store/tipos"

const FORMATOS: TournamentFormat[] = [
  "liga",
  "mata_mata",
  "grupos_mata_mata",
  "fase_liga",
  "avulso",
]
const STATUSES: TournamentStatus[] = ["rascunho", "ativo", "encerrado"]
const POR_PAGINA = 6

type Ordem = "recentes" | "antigos" | "nome"

function FormularioTorneio({
  inicial,
  onSalvar,
  triggerLabel,
  triggerVariant = "default",
}: {
  inicial?: TorneioDemo
  onSalvar: (nome: string, formato: TournamentFormat) => void
  triggerLabel: React.ReactNode
  triggerVariant?: "default" | "ghost" | "outline"
}) {
  const [aberto, setAberto] = React.useState(false)
  const [nome, setNome] = React.useState(inicial?.nome ?? "")
  const [formato, setFormato] = React.useState<TournamentFormat>(
    inicial?.formato ?? "liga"
  )

  const abrir = (open: boolean) => {
    setAberto(open)
    if (open) {
      setNome(inicial?.nome ?? "")
      setFormato(inicial?.formato ?? "liga")
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar torneio" : "Criar torneio"}</DialogTitle>
          <DialogDescription>
            Tudo fica só nesta demonstração — nada é gravado no sistema real.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Nome</span>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Copa da Vizinhança"
              maxLength={80}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Formato</span>
            <SelectNative
              value={formato}
              onChange={(e) => setFormato(e.target.value as TournamentFormat)}
              className="md:h-9"
            >
              {FORMATOS.map((f) => (
                <option key={f} value={f}>
                  {FORMATO_META[f].label}
                </option>
              ))}
            </SelectNative>
          </label>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onSalvar(nome, formato)
              setAberto(false)
            }}
          >
            {inicial ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmarExclusao({
  nome,
  onConfirmar,
}: {
  nome: string
  onConfirmar: () => void
}) {
  const [aberto, setAberto] = React.useState(false)
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Excluir ${nome}`}>
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir “{nome}”?</DialogTitle>
          <DialogDescription>
            Esta ação remove o torneio apenas desta demonstração. Não afeta o sistema
            real.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirmar()
              setAberto(false)
            }}
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DemoTorneiosLista() {
  const { state, dispatch } = useDemoStore()
  const flags = usePerfilFlags()
  const [busca, setBusca] = React.useState("")
  const [filtroStatus, setFiltroStatus] = React.useState<TournamentStatus | "todos">(
    "todos"
  )
  const [ordem, setOrdem] = React.useState<Ordem>("recentes")
  const [pagina, setPagina] = React.useState(0)

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const arr = state.torneios.filter((t) => {
      const casaTexto = termo === "" || t.nome.toLowerCase().includes(termo)
      const casaStatus = filtroStatus === "todos" || t.status === filtroStatus
      return casaTexto && casaStatus
    })
    arr.sort((a, b) => {
      if (ordem === "nome") return a.nome.localeCompare(b.nome)
      const da = Date.parse(a.criadoEm)
      const db = Date.parse(b.criadoEm)
      return ordem === "recentes" ? db - da : da - db
    })
    return arr
  }, [state.torneios, busca, filtroStatus, ordem])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(
    paginaAtual * POR_PAGINA,
    paginaAtual * POR_PAGINA + POR_PAGINA
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold">Torneios</h1>
        {flags.podeGerir ? (
          <FormularioTorneio
            triggerLabel={
              <>
                <Plus aria-hidden className="size-3.5" /> Criar torneio
              </>
            }
            onSalvar={(nome, formato) =>
              dispatch({ type: "CRIAR_TORNEIO", nome, formato })
            }
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[10rem]">
          <span className="sr-only">Buscar torneio</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(0)
            }}
            placeholder="Buscar por nome"
            className="pl-8"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">Filtrar por status</span>
          <SelectNative
            value={filtroStatus}
            onChange={(e) => {
              setFiltroStatus(e.target.value as TournamentStatus | "todos")
              setPagina(0)
            }}
            aria-label="Filtrar por status"
            className="md:h-9"
          >
            <option value="todos">Todos os status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "rascunho" ? "Rascunho" : s === "ativo" ? "Ativo" : "Encerrado"}
              </option>
            ))}
          </SelectNative>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="sr-only">Ordenar</span>
          <SelectNative
            value={ordem}
            onChange={(e) => {
              setOrdem(e.target.value as Ordem)
              setPagina(0)
            }}
            aria-label="Ordenar"
            className="md:h-9"
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
            <option value="nome">Nome (A–Z)</option>
          </SelectNative>
        </label>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          Nenhum torneio encontrado. Ajuste a busca/filtros ou crie um novo.
        </div>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {visiveis.map((t) => {
            const meta = FORMATO_META[t.formato]
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5"
              >
                <ChampionshipBadge
                  icon={<meta.Icon className="size-4" />}
                  primary={t.corPrimaria}
                  secondary={t.corSecundaria}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/demo/torneios/${t.id}`}
                    prefetch={false}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {t.nome}
                  </Link>
                  <span className="text-xs text-muted-foreground">{meta.label}</span>
                </div>
                <StatusPill status={t.status} />
                {flags.podeGerir ? (
                  <>
                    <label className="text-xs">
                      <span className="sr-only">Mudar status de {t.nome}</span>
                      <SelectNative
                        value={t.status}
                        onChange={(e) =>
                          dispatch({
                            type: "MUDAR_STATUS",
                            id: t.id,
                            status: e.target.value as TournamentStatus,
                          })
                        }
                        aria-label={`Mudar status de ${t.nome}`}
                        className="px-1.5 md:text-xs"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s === "rascunho"
                              ? "Rascunho"
                              : s === "ativo"
                                ? "Ativo"
                                : "Encerrado"}
                          </option>
                        ))}
                      </SelectNative>
                    </label>
                    <FormularioTorneio
                      inicial={t}
                      triggerVariant="ghost"
                      triggerLabel={
                        <>
                          <Pencil aria-hidden className="size-3.5" /> Editar
                        </>
                      }
                      onSalvar={(nome, formato) =>
                        dispatch({ type: "EDITAR_TORNEIO", id: t.id, nome, formato })
                      }
                    />
                    <ConfirmarExclusao
                      nome={t.nome}
                      onConfirmar={() =>
                        dispatch({ type: "EXCLUIR_TORNEIO", id: t.id })
                      }
                    />
                  </>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {totalPaginas > 1 ? (
        <nav
          aria-label="Paginação de torneios"
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
