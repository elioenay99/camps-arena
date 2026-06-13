"use client"

import { useMemo, useState, useTransition } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Dices,
  GitBranch,
  Loader2,
  Minus,
  Swords,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  calcularFluxoTemporada,
  confirmarFluxoTemporada,
} from "@/actions/leaguePyramid"
import {
  type AjusteFluxo,
  type Destino,
  type ItemPlanoFluxo,
  type PlanoFluxoTemporada,
} from "@/features/league/flowEngine"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/* -------------------------------------------------------------------------- */
/* Tipos da folha (identidade dos competidores vem RESOLVIDA do servidor)      */
/* -------------------------------------------------------------------------- */

/**
 * Identidade exibível de um competidor. O PLANO da action carrega só
 * `competitorId` (read-only, sem nomes) — a página da temporada (RSC) resolve
 * estes rótulos e os passa por prop, mantendo o painel reusável e sem buscar
 * dados no cliente.
 */
export interface CompetidorRotulo {
  nome: string
  escudoUrl?: string | null
  avatarUrl?: string | null
}

export interface FluxoTemporadaPanelProps {
  seasonId: string
  /** Identidade por id de competidor (resolvida no servidor). */
  competidores?: Record<string, CompetidorRotulo | undefined>
  /** Nome legível de cada nível (ex.: 1 → "Série A"). */
  nivelNomes?: Record<number, string | undefined>
}

/* -------------------------------------------------------------------------- */
/* Helpers de apresentação                                                     */
/* -------------------------------------------------------------------------- */

const DESTINO_LABEL: Record<Destino, string> = {
  sobe: "Sobe",
  cai: "Cai",
  permanece: "Permanece",
}

function rotuloNivel(nivel: number, nomes?: FluxoTemporadaPanelProps["nivelNomes"]) {
  return nomes?.[nivel] ?? `Divisão ${nivel}`
}

/** Identidade exibível (com fallback estável quando o nome não veio do servidor). */
function identidade(
  competitorId: string,
  mapa?: FluxoTemporadaPanelProps["competidores"]
): CompetidorRotulo {
  return mapa?.[competitorId] ?? { nome: `Competidor ${competitorId.slice(0, 4)}` }
}

/* -------------------------------------------------------------------------- */
/* Lógica de ajuste do empate (sorteio → override)                             */
/* -------------------------------------------------------------------------- */

/**
 * Chave de um grupo de empate sorteado: nível de origem + a PONTA do corte
 * (sobe = acesso; cai = rebaixamento). Reordenar dentro do grupo decide QUEM
 * leva as vagas.
 */
type ChaveGrupo = `${number}:${Exclude<Destino, "permanece">}`

interface GrupoSorteio {
  chave: ChaveGrupo
  nivelOrigem: number
  /** Destino qualificado em disputa neste grupo ("sobe" ou "cai"). */
  destinoQualificado: Exclude<Destino, "permanece">
  /** Quantas vagas qualificadas existem (= membros que levaram a vaga). */
  vagas: number
  /** Nível de destino do qualificado (sobe = origem-1; cai = origem+1). */
  nivelQualificado: number
  /** competitorIds na ORDEM atual (editável). */
  ordem: string[]
}

/**
 * Extrai os grupos de empate resolvidos por sorteio do plano. Cada grupo reúne
 * TODOS os competidores de UM corte sorteado (mesmo nível + mesma `cortePonta`):
 * os que levaram a vaga (destino = ponta) E os que a perderam (permanece). A
 * quantidade de vagas é fixa (conservação) — reordenar só troca quem as ocupa.
 * Agrupar pela `cortePonta` (vinda do motor) evita o vazamento entre o corte de
 * acesso e o de rebaixamento numa mesma divisão do meio.
 */
function extrairGruposSorteio(plano: PlanoFluxoTemporada): GrupoSorteio[] {
  const porChave = new Map<ChaveGrupo, ItemPlanoFluxo[]>()
  for (const it of plano.itens) {
    if (it.resolvidoPor !== "sorteio" || !it.cortePonta) continue
    const chave: ChaveGrupo = `${it.nivelOrigem}:${it.cortePonta}`
    const lista = porChave.get(chave) ?? []
    lista.push(it)
    porChave.set(chave, lista)
  }

  const grupos: GrupoSorteio[] = []
  for (const [chave, membros] of porChave) {
    const nivelOrigem = membros[0].nivelOrigem
    const destinoQualificado = membros[0].cortePonta as Exclude<Destino, "permanece">
    const nivelQualificado =
      destinoQualificado === "sobe" ? nivelOrigem - 1 : nivelOrigem + 1
    // Vagas = quantos do grupo de fato levaram a vaga (destino === a ponta).
    const vagas = membros.filter((m) => m.destino === destinoQualificado).length
    // Ordem inicial = RESULTADO DO SORTEIO: os vencedores (destino qualificado)
    // primeiro, depois os perdedores (permanece) — assim os primeiros `vagas`
    // índices reproduzem o que o motor sorteou. Ordenar só por posição (todos
    // empatados na mesma) faria a UI sobrescrever o sorteio com um "Ajuste"
    // fantasma. Desempate estável por posição dentro de cada lado.
    const ordem = [...membros]
      .sort((a, b) => {
        const aGanhou = a.destino === destinoQualificado ? 0 : 1
        const bGanhou = b.destino === destinoQualificado ? 0 : 1
        if (aGanhou !== bGanhou) return aGanhou - bGanhou
        return a.posicaoFinal - b.posicaoFinal
      })
      .map((it) => it.competitorId)
    grupos.push({
      chave,
      nivelOrigem,
      destinoQualificado,
      vagas,
      nivelQualificado,
      ordem,
    })
  }
  return grupos.sort((a, b) => a.nivelOrigem - b.nivelOrigem)
}

/**
 * Constrói os `AjusteFluxo[]` a partir das ordens editadas: por grupo, os
 * primeiros `vagas` competidores levam o destino qualificado; o resto permanece.
 * Só inclui ajustes que DIVERGEM do plano original (override mínimo).
 */
function montarAjustes(
  grupos: GrupoSorteio[],
  planoOriginal: Map<string, ItemPlanoFluxo>
): AjusteFluxo[] {
  const ajustes: AjusteFluxo[] = []
  for (const g of grupos) {
    g.ordem.forEach((competitorId, i) => {
      const ganha = i < g.vagas
      const destino: Destino = ganha ? g.destinoQualificado : "permanece"
      const nivelDestino = ganha ? g.nivelQualificado : g.nivelOrigem
      const orig = planoOriginal.get(competitorId)
      if (!orig || orig.destino !== destino || orig.nivelDestino !== nivelDestino) {
        ajustes.push({ competitorId, destino, nivelDestino })
      }
    })
  }
  return ajustes
}

/* -------------------------------------------------------------------------- */
/* Componente                                                                  */
/* -------------------------------------------------------------------------- */

type Fase = "vazio" | "plano"

/**
 * Painel de fim de temporada (console do dono da liga). Fluxo de 2 cliques:
 * 1. "Calcular fluxo" → deriva o PLANO sobe/cai (read-only) e o exibe por
 *    divisão, marcando sorteios e a semente.
 * 2. (opcional) reordenar empates resolvidos por sorteio antes de confirmar.
 * 3. "Confirmar e gerar próxima temporada" → escreve e monta a N+1.
 *
 * O painel recebe só `seasonId`; a identidade dos competidores chega por prop
 * (resolvida no RSC), pois o PLANO da action carrega apenas ids.
 */
export function FluxoTemporadaPanel({
  seasonId,
  competidores,
  nivelNomes,
}: FluxoTemporadaPanelProps) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>("vazio")
  const [plano, setPlano] = useState<PlanoFluxoTemporada | null>(null)
  const [grupos, setGrupos] = useState<GrupoSorteio[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [calculando, iniciarCalculo] = useTransition()
  const [confirmando, iniciarConfirmacao] = useTransition()

  const pendente = calculando || confirmando

  // Plano indexado por competidor (para diff de override e enriquecer a tabela).
  const planoPorCompetidor = useMemo(() => {
    const m = new Map<string, ItemPlanoFluxo>()
    if (plano) for (const it of plano.itens) m.set(it.competitorId, it)
    return m
  }, [plano])

  // Destino EFETIVO por competidor (plano + reordenação de empates).
  const efetivos = useMemo(() => {
    const m = new Map<string, { destino: Destino; resolvidoPor: ItemPlanoFluxo["resolvidoPor"] }>()
    if (!plano) return m
    for (const it of plano.itens) {
      m.set(it.competitorId, { destino: it.destino, resolvidoPor: it.resolvidoPor })
    }
    for (const g of grupos) {
      g.ordem.forEach((competitorId, i) => {
        const ganha = i < g.vagas
        const orig = planoPorCompetidor.get(competitorId)
        const destino: Destino = ganha ? g.destinoQualificado : "permanece"
        const mudou = orig && (orig.destino !== destino)
        m.set(competitorId, {
          destino,
          resolvidoPor: mudou ? "override" : "sorteio",
        })
      })
    }
    return m
  }, [plano, grupos, planoPorCompetidor])

  // Itens agrupados por nível de origem para a renderização por divisão.
  const divisoes = useMemo(() => {
    if (!plano) return []
    const porNivel = new Map<number, ItemPlanoFluxo[]>()
    for (const it of plano.itens) {
      const lista = porNivel.get(it.nivelOrigem) ?? []
      lista.push(it)
      porNivel.set(it.nivelOrigem, lista)
    }
    return [...porNivel.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nivel, itens]) => ({
        nivel,
        itens: [...itens].sort((a, b) => a.posicaoFinal - b.posicaoFinal),
      }))
  }, [plano])

  const temSorteio = grupos.length > 0

  function calcular() {
    setErro(null)
    iniciarCalculo(async () => {
      const r = await calcularFluxoTemporada(seasonId)
      if (!r.ok) {
        setErro(r.error)
        toast.error(r.error)
        return
      }
      setPlano(r.plano)
      setGrupos(extrairGruposSorteio(r.plano))
      setFase("plano")
    })
  }

  function reordenar(chave: ChaveGrupo, indice: number, direcao: -1 | 1) {
    setGrupos((atual) =>
      atual.map((g) => {
        if (g.chave !== chave) return g
        const alvo = indice + direcao
        if (alvo < 0 || alvo >= g.ordem.length) return g
        const nova = [...g.ordem]
        ;[nova[indice], nova[alvo]] = [nova[alvo], nova[indice]]
        return { ...g, ordem: nova }
      })
    )
  }

  function confirmar() {
    setErro(null)
    const ajustes = montarAjustes(grupos, planoPorCompetidor)
    iniciarConfirmacao(async () => {
      const r = await confirmarFluxoTemporada(seasonId, ajustes.length ? ajustes : undefined)
      if (!r.ok) {
        setErro(r.error)
        toast.error(r.error)
        return
      }
      toast.success("Próxima temporada gerada. Bola pra frente!")
      router.refresh()
    })
  }

  /* ----------------------------- Estado: vazio ---------------------------- */
  if (fase === "vazio") {
    return (
      <Card className="elevate flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className="glow-primary flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <GitBranch className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-lg font-bold">Fim de temporada</h3>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            Calcule o sobe e cai entre as divisões. Você revisa o plano antes de
            gerar a próxima temporada.
          </p>
        </div>
        <Button type="button" className="rounded-full" onClick={calcular} disabled={pendente}>
          {calculando ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Calculando…
            </>
          ) : (
            "Calcular fluxo"
          )}
        </Button>
        {erro ? <PainelErro mensagem={erro} /> : null}
      </Card>
    )
  }

  /* ----------------------------- Estado: plano ---------------------------- */
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h3 className="font-display text-lg font-bold tracking-tight">Plano de sobe e cai</h3>
        <p className="text-sm text-muted-foreground">
          Confira o destino de cada competidor. Empates na linha de corte foram
          resolvidos por sorteio — você pode reordená-los antes de confirmar.
        </p>
      </header>

      {temSorteio ? <AvisoSorteio seed={plano?.seed ?? ""} /> : null}

      <div className="flex flex-col gap-5">
        {divisoes.map((div) => {
          // TODOS os grupos do nível: uma divisão do meio pode ter empate no
          // acesso (sobe) E no rebaixamento (cai) ao mesmo tempo — `.find()`
          // esconderia o segundo corte (chip "Sorteio" sem como reordenar).
          const gruposDoNivel = grupos.filter((g) => g.nivelOrigem === div.nivel)
          return (
            <DivisaoFluxo
              key={div.nivel}
              titulo={rotuloNivel(div.nivel, nivelNomes)}
              itens={div.itens}
              efetivos={efetivos}
              competidores={competidores}
              gruposSorteio={gruposDoNivel}
              onReordenar={reordenar}
              bloqueado={pendente}
            />
          )
        })}
      </div>

      {erro ? <PainelErro mensagem={erro} /> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={calcular}
          disabled={pendente}
        >
          {calculando ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Recalculando…
            </>
          ) : (
            "Recalcular"
          )}
        </Button>
        <Button
          type="button"
          className="rounded-full"
          onClick={confirmar}
          disabled={pendente}
        >
          {confirmando ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Gerando temporada…
            </>
          ) : (
            "Confirmar e gerar próxima temporada"
          )}
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Subcomponentes                                                              */
/* -------------------------------------------------------------------------- */

function PainelErro({ mensagem }: { mensagem: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {mensagem}
    </p>
  )
}

function AvisoSorteio({ seed }: { seed: string }) {
  return (
    <Card
      size="sm"
      className="elevate flex-row items-start gap-3 bg-accent/10 px-4 ring-accent/30"
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
        <Dices className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium">Empate decidido por sorteio</p>
        <p className="text-xs text-muted-foreground">
          Reordene os empatados abaixo se quiser sobrepor o sorteio. Semente para
          auditoria:
        </p>
        <code className="mt-0.5 block truncate font-mono text-[0.7rem] text-muted-foreground">
          {seed}
        </code>
      </div>
    </Card>
  )
}

function DivisaoFluxo({
  titulo,
  itens,
  efetivos,
  competidores,
  gruposSorteio,
  onReordenar,
  bloqueado,
}: {
  titulo: string
  itens: ItemPlanoFluxo[]
  efetivos: Map<string, { destino: Destino; resolvidoPor: ItemPlanoFluxo["resolvidoPor"] }>
  competidores?: FluxoTemporadaPanelProps["competidores"]
  /** Todos os grupos de empate sorteado deste nível (acesso e/ou rebaixamento). */
  gruposSorteio: GrupoSorteio[]
  onReordenar: (chave: ChaveGrupo, indice: number, direcao: -1 | 1) => void
  bloqueado: boolean
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2.5">
      <h4 className="font-display flex items-center gap-2 text-sm font-bold tracking-tight">
        <span
          className="inline-flex size-5 items-center justify-center rounded-md bg-primary/10 text-[0.7rem] font-bold text-primary tabular-nums"
          aria-hidden="true"
        >
          {itens[0]?.nivelOrigem ?? "·"}
        </span>
        {titulo}
      </h4>
      <Card className="elevate overflow-hidden p-0" size="sm">
        <CardContent className="flex flex-col p-0">
          <ul className="flex list-none flex-col">
            {itens.map((it) => {
              const efetivo = efetivos.get(it.competitorId)
              const destino = efetivo?.destino ?? it.destino
              const resolvidoPor = efetivo?.resolvidoPor ?? it.resolvidoPor
              // Localiza O grupo ao qual ESTE item pertence (uma divisão do meio
              // pode ter dois: sobe e cai). indexOf >= 0 só no grupo dono.
              const grupo = gruposSorteio.find((g) => g.ordem.includes(it.competitorId))
              const indiceNoGrupo = grupo?.ordem.indexOf(it.competitorId) ?? -1
              return (
                <LinhaCompetidor
                  key={it.competitorId}
                  item={it}
                  destino={destino}
                  resolvidoPor={resolvidoPor}
                  identidade={identidade(it.competitorId, competidores)}
                  reordenavel={
                    grupo && indiceNoGrupo >= 0
                      ? {
                          indice: indiceNoGrupo,
                          total: grupo.ordem.length,
                          onSobe: () => onReordenar(grupo.chave, indiceNoGrupo, -1),
                          onDesce: () => onReordenar(grupo.chave, indiceNoGrupo, 1),
                          bloqueado,
                        }
                      : undefined
                  }
                />
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}

const DESTINO_ESTILO: Record<
  Destino,
  { Icon: typeof ArrowUp; classe: string; chip: string }
> = {
  sobe: {
    Icon: ArrowUp,
    classe: "text-primary",
    chip: "border-primary/30 bg-primary/10 text-primary",
  },
  cai: {
    Icon: ArrowDown,
    classe: "text-destructive",
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  permanece: {
    Icon: Minus,
    classe: "text-muted-foreground",
    chip: "border-border bg-muted/40 text-muted-foreground",
  },
}

function LinhaCompetidor({
  item,
  destino,
  resolvidoPor,
  identidade,
  reordenavel,
}: {
  item: ItemPlanoFluxo
  destino: Destino
  resolvidoPor: ItemPlanoFluxo["resolvidoPor"]
  identidade: CompetidorRotulo
  reordenavel?: {
    indice: number
    total: number
    onSobe: () => void
    onDesce: () => void
    bloqueado: boolean
  }
}) {
  const estilo = DESTINO_ESTILO[destino]
  const { Icon } = estilo
  const temEscudo = Boolean(identidade.escudoUrl)
  return (
    <li className="flex items-center gap-2.5 border-b px-3 py-2.5 last:border-b-0 motion-safe:transition-colors hover:bg-muted/30">
      <span className="w-7 shrink-0 text-center font-display text-sm font-bold tabular-nums text-muted-foreground">
        {item.posicaoFinal}º
      </span>
      <span className="shrink-0" aria-hidden="true">
        {temEscudo ? (
          <TeamCrest nome={identidade.nome} escudoUrl={identidade.escudoUrl} size={24} />
        ) : (
          <UserAvatar nome={identidade.nome} avatarUrl={identidade.avatarUrl} size={24} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{identidade.nome}</span>

      {reordenavel ? (
        <span className="flex shrink-0 flex-col" role="group" aria-label="Reordenar empate">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-7"
            disabled={reordenavel.bloqueado || reordenavel.indice === 0}
            onClick={reordenavel.onSobe}
            aria-label={`Subir ${identidade.nome} no desempate`}
          >
            <ChevronUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-7"
            disabled={reordenavel.bloqueado || reordenavel.indice === reordenavel.total - 1}
            onClick={reordenavel.onDesce}
            aria-label={`Descer ${identidade.nome} no desempate`}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </span>
      ) : null}

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
          estilo.chip
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        {DESTINO_LABEL[destino]}
      </span>

      {resolvidoPor === "playoff" ? (
        // Decidido na CHAVE de playoff/playout — motivo distinto do sorteio
        // (accent): gold (cor de chave/campeão, ver BracketView). Não há o que
        // reordenar (a chave decidiu por jogo), então sem affordance de empate.
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold-ink"
          title="Decidido na chave de playoff"
        >
          <Swords className="size-3" aria-hidden="true" />
          Playoff
        </span>
      ) : resolvidoPor === "sorteio" || resolvidoPor === "override" ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-foreground"
          title={resolvidoPor === "override" ? "Ajustado manualmente" : "Decidido por sorteio"}
        >
          <Dices className="size-3" aria-hidden="true" />
          {resolvidoPor === "override" ? "Ajuste" : "Sorteio"}
        </span>
      ) : null}
    </li>
  )
}
