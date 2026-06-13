"use client"

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Layers,
  Plus,
  Trophy,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { createCompetition } from "@/actions/leaguePyramid"
import { selectTeam } from "@/actions/teams"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"
import { cn } from "@/lib/utils"
import type { TeamResult } from "@/schema/teamSchema"
import {
  DESEMPATES_DISPONIVEIS,
  DIVISAO_MAX_TAMANHO,
  DIVISAO_MIN_TAMANHO,
  MAX_DIVISOES,
  PIRAMIDE_PRESETS,
  PRESET_PERSONALIZADO,
  type CreateCompetitionInput,
  type PiramidePresetId,
} from "@/schema/leaguePyramidSchema"

/* -------------------------------------------------------------------------- */
/* Modelo de estado do cliente (espelha o schema, mas mutável passo-a-passo)  */
/* -------------------------------------------------------------------------- */

/** Competidor no modo CLUBE — `teamId` é o id LOCAL (de `selectTeam`). */
interface ClubeRascunho {
  tipo: "clube"
  teamId: string
  nome: string
  escudo?: string
  externalId: string
}

/** Competidor no modo NOME — rótulo livre. */
interface NomeRascunho {
  tipo: "nome"
  rotulo: string
}

type CompetidorRascunho = ClubeRascunho | NomeRascunho

/** Uma divisão em construção. `nivel` = 1 (topo) … N. */
interface DivisaoRascunho {
  nivel: number
  nome: string
  porNome: boolean
  desempate: (typeof DESEMPATES_DISPONIVEIS)[number]
  tamanho: number
  competidores: CompetidorRascunho[]
}

/** Uma fronteira entre `nivelSuperior` (d) e d+1. */
interface FronteiraRascunho {
  nivelSuperior: number
  vagasAcesso: number
  vagasRebaixamento: number
}

const PASSOS = ["preset", "divisoes", "fronteiras", "competidores"] as const
type Passo = (typeof PASSOS)[number]

const ROTULO_PASSO: Record<Passo, string> = {
  preset: "Formato",
  divisoes: "Divisões",
  fronteiras: "Acesso e queda",
  competidores: "Competidores",
}

const DESEMPATE_ROTULO: Record<(typeof DESEMPATES_DISPONIVEIS)[number], string> = {
  cbf: "CBF (vitórias, saldo, gols pró)",
  ingles: "Inglês (saldo, gols pró, vitórias)",
}

/** Nome amigável de uma divisão por nível, quando o dono não nomeou. */
function nomePadraoDivisao(nivel: number): string {
  return `Divisão ${nivel}`
}

/* -------------------------------------------------------------------------- */
/* Presets → esqueleto inicial de divisões/fronteiras                          */
/* -------------------------------------------------------------------------- */

/**
 * Hidrata o rascunho a partir de um preset. Os presets só carregam o esqueleto
 * sobe/cai e o desempate; começamos com 2 divisões de 20 (o caso clássico) —
 * o dono ajusta nomes/tamanhos no passo seguinte. "Personalizado" começa com
 * uma única divisão e sem fronteiras.
 */
function hidratarPreset(preset: PiramidePresetId): {
  divisoes: DivisaoRascunho[]
  fronteiras: FronteiraRascunho[]
} {
  if (preset === PRESET_PERSONALIZADO) {
    return {
      divisoes: [novaDivisao(1, "cbf")],
      fronteiras: [],
    }
  }

  const meta = PIRAMIDE_PRESETS[preset]
  const divisoes = [novaDivisao(1, meta.desempate), novaDivisao(2, meta.desempate)]
  const fronteiras: FronteiraRascunho[] = [
    {
      nivelSuperior: 1,
      vagasAcesso: meta.vagasPorFronteira,
      vagasRebaixamento: meta.vagasPorFronteira,
    },
  ]
  return { divisoes, fronteiras }
}

function novaDivisao(
  nivel: number,
  desempate: (typeof DESEMPATES_DISPONIVEIS)[number]
): DivisaoRascunho {
  return {
    nivel,
    nome: nomePadraoDivisao(nivel),
    porNome: false,
    desempate,
    tamanho: 20,
    competidores: [],
  }
}

/* -------------------------------------------------------------------------- */
/* Validação leve no cliente (espelha o schema; a action revalida de verdade)  */
/* -------------------------------------------------------------------------- */

/** Tamanho de cada divisão APÓS o sobe/cai (conservação — design §7.1). */
function tamanhoFinal(
  divisoes: DivisaoRascunho[],
  fronteiras: FronteiraRascunho[]
): Map<number, number> {
  const sobe = new Map<number, number>()
  const cai = new Map<number, number>()
  const recebeDeCima = new Map<number, number>()
  const recebeDeBaixo = new Map<number, number>()

  for (const f of fronteiras) {
    const sup = f.nivelSuperior
    const inf = sup + 1
    cai.set(sup, (cai.get(sup) ?? 0) + f.vagasRebaixamento)
    recebeDeCima.set(inf, (recebeDeCima.get(inf) ?? 0) + f.vagasRebaixamento)
    sobe.set(inf, (sobe.get(inf) ?? 0) + f.vagasAcesso)
    recebeDeBaixo.set(sup, (recebeDeBaixo.get(sup) ?? 0) + f.vagasAcesso)
  }

  const final = new Map<number, number>()
  for (const d of divisoes) {
    final.set(
      d.nivel,
      d.tamanho -
        (sobe.get(d.nivel) ?? 0) -
        (cai.get(d.nivel) ?? 0) +
        (recebeDeCima.get(d.nivel) ?? 0) +
        (recebeDeBaixo.get(d.nivel) ?? 0)
    )
  }
  return final
}

/** Mensagem de bloqueio do passo de fronteiras (null = ok para avançar). */
function erroConservacao(
  divisoes: DivisaoRascunho[],
  fronteiras: FronteiraRascunho[]
): string | null {
  // SIMETRIA (espelha o servidor): sobem e caem o mesmo número por fronteira —
  // no modo direto a assimetria faria os tamanhos oscilarem entre temporadas.
  // O campo único do passo já garante isto; esta checagem é defesa.
  for (const f of fronteiras) {
    if (f.vagasAcesso !== f.vagasRebaixamento) {
      const sup = divisoes.find((d) => d.nivel === f.nivelSuperior)
      const inf = divisoes.find((d) => d.nivel === f.nivelSuperior + 1)
      return `Entre ${sup?.nome || nomePadraoDivisao(f.nivelSuperior)} e ${inf?.nome || nomePadraoDivisao(f.nivelSuperior + 1)}: devem subir e cair o mesmo número de competidores.`
    }
  }

  // MOVIMENTO FÍSICO (espelha o superRefine do servidor): a divisão não pode
  // promover E rebaixar mais competidores do que ela tem. O fechamento abaixo
  // pode mascarar isso (ex.: tamanho 3 com 4 sobem + 4 caem ainda fecha em 3),
  // então checamos antes — senão a UI deixaria avançar e o servidor rejeitaria.
  const sobe = new Map<number, number>()
  const cai = new Map<number, number>()
  for (const f of fronteiras) {
    cai.set(f.nivelSuperior, (cai.get(f.nivelSuperior) ?? 0) + f.vagasRebaixamento)
    sobe.set(
      f.nivelSuperior + 1,
      (sobe.get(f.nivelSuperior + 1) ?? 0) + f.vagasAcesso
    )
  }
  for (const d of divisoes) {
    const saem = (sobe.get(d.nivel) ?? 0) + (cai.get(d.nivel) ?? 0)
    if (saem > d.tamanho) {
      return `${d.nome || nomePadraoDivisao(d.nivel)} não pode promover e rebaixar ${saem} competidores: ela só tem ${d.tamanho}. Reduza as vagas das fronteiras.`
    }
  }

  const final = tamanhoFinal(divisoes, fronteiras)
  for (const d of divisoes) {
    const pos = final.get(d.nivel) ?? d.tamanho
    if (pos < DIVISAO_MIN_TAMANHO) {
      return `${d.nome || nomePadraoDivisao(d.nivel)} terminaria com ${pos} competidores (mínimo ${DIVISAO_MIN_TAMANHO}). Ajuste tamanhos ou vagas.`
    }
    if (pos > DIVISAO_MAX_TAMANHO) {
      return `${d.nome || nomePadraoDivisao(d.nivel)} terminaria com ${pos} competidores (máximo ${DIVISAO_MAX_TAMANHO}). Ajuste tamanhos ou vagas.`
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Componente principal                                                        */
/* -------------------------------------------------------------------------- */

export function LeagueWizard() {
  const router = useRouter()

  const [passoAtual, setPassoAtual] = React.useState<Passo>("preset")
  const [nome, setNome] = React.useState("")
  const [isPublic, setIsPublic] = React.useState(true)
  const [preset, setPreset] = React.useState<PiramidePresetId | null>(null)
  const [divisoes, setDivisoes] = React.useState<DivisaoRascunho[]>([])
  const [fronteiras, setFronteiras] = React.useState<FronteiraRascunho[]>([])
  const [divisaoAtiva, setDivisaoAtiva] = React.useState(0)
  const [enviando, startTransition] = React.useTransition()

  const indicePasso = PASSOS.indexOf(passoAtual)

  function escolherPreset(p: PiramidePresetId) {
    setPreset(p)
    const { divisoes: d, fronteiras: f } = hidratarPreset(p)
    setDivisoes(d)
    setFronteiras(f)
    setDivisaoAtiva(0)
  }

  /* --- Mutações de divisões ---------------------------------------------- */

  function atualizarDivisao(idx: number, patch: Partial<DivisaoRascunho>) {
    setDivisoes((atual) =>
      atual.map((d, i) => {
        if (i !== idx) return d
        const proxima = { ...d, ...patch }
        // Trocar o modo (clube↔nome) limpa competidores incompatíveis.
        if (patch.porNome !== undefined && patch.porNome !== d.porNome) {
          proxima.competidores = []
        }
        // Reduzir o tamanho apara competidores que sobraram.
        if (patch.tamanho !== undefined && proxima.competidores.length > patch.tamanho) {
          proxima.competidores = proxima.competidores.slice(0, patch.tamanho)
        }
        return proxima
      })
    )
  }

  function adicionarDivisao() {
    setDivisoes((atual) => {
      if (atual.length >= MAX_DIVISOES) return atual
      const nivel = atual.length + 1
      const desempate = atual[atual.length - 1]?.desempate ?? "cbf"
      const nova = novaDivisao(nivel, desempate)
      // Toda nova divisão (>1) ganha uma fronteira "direto" 0/0 com a de cima;
      // o dono ajusta as vagas no passo de fronteiras.
      if (nivel > 1) {
        setFronteiras((fAtual) => [
          ...fAtual,
          { nivelSuperior: nivel - 1, vagasAcesso: 0, vagasRebaixamento: 0 },
        ])
      }
      return [...atual, nova]
    })
  }

  function removerDivisao(idx: number) {
    setDivisoes((atual) => {
      if (atual.length <= 1) return atual
      const restantes = atual
        .filter((_, i) => i !== idx)
        // Renumera os níveis para 1..N contínuos.
        .map((d, i) => ({ ...d, nivel: i + 1 }))
      // Recalcula as fronteiras: uma por par adjacente, preservando vagas quando
      // possível pela posição.
      setFronteiras((fAtual) => {
        const novas: FronteiraRascunho[] = []
        for (let nivel = 1; nivel < restantes.length; nivel++) {
          const antiga = fAtual[nivel - 1]
          novas.push({
            nivelSuperior: nivel,
            vagasAcesso: antiga?.vagasAcesso ?? 0,
            vagasRebaixamento: antiga?.vagasRebaixamento ?? 0,
          })
        }
        return novas
      })
      return restantes
    })
    // `divisoes` é o valor stale (antes do filter) → length-2 = novo índice máx.
    // Se a removida está ANTES da aba ativa, a ativa desce 1 para seguir a mesma
    // divisão; senão, só clampa ao novo máximo.
    setDivisaoAtiva((a) => {
      const novoMax = divisoes.length - 2
      const alvo = idx < a ? a - 1 : a
      return Math.max(0, Math.min(alvo, novoMax))
    })
  }

  /* --- Mutações de fronteiras -------------------------------------------- */

  function atualizarFronteira(nivelSuperior: number, patch: Partial<FronteiraRascunho>) {
    setFronteiras((atual) =>
      atual.map((f) => (f.nivelSuperior === nivelSuperior ? { ...f, ...patch } : f))
    )
  }

  /* --- Mutações de competidores ------------------------------------------ */

  function adicionarCompetidor(divIdx: number, comp: CompetidorRascunho) {
    setDivisoes((atual) =>
      atual.map((d, i) => {
        if (i !== divIdx) return d
        if (d.competidores.length >= d.tamanho) return d
        return { ...d, competidores: [...d.competidores, comp] }
      })
    )
  }

  function removerCompetidor(divIdx: number, compIdx: number) {
    setDivisoes((atual) =>
      atual.map((d, i) =>
        i === divIdx
          ? { ...d, competidores: d.competidores.filter((_, j) => j !== compIdx) }
          : d
      )
    )
  }

  /* --- Navegação --------------------------------------------------------- */

  const podeAvancar = ((): boolean => {
    if (passoAtual === "preset") return preset !== null && nome.trim().length >= 2
    if (passoAtual === "divisoes")
      return divisoes.every((d) => d.nome.trim().length >= 1)
    if (passoAtual === "fronteiras")
      return erroConservacao(divisoes, fronteiras) === null
    return true
  })()

  function avancar() {
    if (!podeAvancar) return
    setPassoAtual(PASSOS[Math.min(indicePasso + 1, PASSOS.length - 1)])
  }
  function voltar() {
    setPassoAtual(PASSOS[Math.max(indicePasso - 1, 0)])
  }

  /* --- Submit ------------------------------------------------------------ */

  function montarInput(): CreateCompetitionInput {
    return {
      nome: nome.trim(),
      isPublic,
      divisoes: divisoes.map((d) => ({
        nivel: d.nivel,
        nome: d.nome.trim() || nomePadraoDivisao(d.nivel),
        porNome: d.porNome,
        desempate: d.desempate,
        tamanho: d.tamanho,
        competidores: d.competidores.map((c) =>
          c.tipo === "nome"
            ? { rotulo: c.rotulo }
            : { teamId: c.teamId, nome: c.nome, escudo: c.escudo }
        ),
      })),
      fronteiras: fronteiras.map((f) => ({
        nivelSuperior: f.nivelSuperior,
        vagasAcesso: f.vagasAcesso,
        vagasRebaixamento: f.vagasRebaixamento,
        modo: "direto" as const,
      })),
    }
  }

  function competidoresFaltando(): { nivel: number; faltam: number }[] {
    return divisoes
      .map((d) => ({ nivel: d.nivel, faltam: d.tamanho - d.competidores.length }))
      .filter((x) => x.faltam !== 0)
  }

  function enviar() {
    const faltando = competidoresFaltando()
    if (faltando.length > 0) {
      const d = faltando[0]
      toast.error(
        d.faltam > 0
          ? `Faltam ${d.faltam} competidores na divisão ${d.nivel}.`
          : `Há competidores a mais na divisão ${d.nivel}.`
      )
      return
    }

    startTransition(async () => {
      const r = await createCompetition(montarInput())
      if (r.competitionId) {
        toast.success("Pirâmide criada! Hora de montar a temporada.")
        router.push(`/dashboard/ligas/${r.seasonId ?? r.competitionId}`)
        return
      }
      if (r.fieldErrors) {
        const primeiro = Object.values(r.fieldErrors).find((v) => v && v.length > 0)
        toast.error(primeiro?.[0] ?? r.error ?? "Verifique os campos e tente de novo.")
        return
      }
      toast.error(r.error ?? "Não foi possível criar a liga agora.")
    })
  }

  /* --- Render ------------------------------------------------------------ */

  return (
    <div className="flex flex-col gap-6">
      <PassosNav atual={indicePasso} />

      <div key={passoAtual} className="animate-rise flex flex-col gap-5">
        {passoAtual === "preset" && (
          <PassoPreset
            nome={nome}
            setNome={setNome}
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            preset={preset}
            onEscolher={escolherPreset}
          />
        )}

        {passoAtual === "divisoes" && (
          <PassoDivisoes
            divisoes={divisoes}
            onAtualizar={atualizarDivisao}
            onAdicionar={adicionarDivisao}
            onRemover={removerDivisao}
          />
        )}

        {passoAtual === "fronteiras" && (
          <PassoFronteiras
            divisoes={divisoes}
            fronteiras={fronteiras}
            onAtualizar={atualizarFronteira}
            finais={tamanhoFinal(divisoes, fronteiras)}
            erro={erroConservacao(divisoes, fronteiras)}
          />
        )}

        {passoAtual === "competidores" && (
          <PassoCompetidores
            divisoes={divisoes}
            divisaoAtiva={divisaoAtiva}
            setDivisaoAtiva={setDivisaoAtiva}
            onAdicionar={adicionarCompetidor}
            onRemover={removerCompetidor}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={voltar}
          disabled={indicePasso === 0 || enviando}
          className="rounded-full"
        >
          <ArrowLeft aria-hidden="true" />
          Anterior
        </Button>

        {passoAtual === "competidores" ? (
          <Button
            type="button"
            size="lg"
            onClick={enviar}
            disabled={enviando}
            className="rounded-full"
          >
            <Check aria-hidden="true" />
            {enviando ? "Criando…" : "Criar pirâmide"}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={avancar}
            disabled={!podeAvancar}
            className="rounded-full"
          >
            Próximo
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Indicador de passos                                                         */
/* -------------------------------------------------------------------------- */

function PassosNav({ atual }: { atual: number }) {
  return (
    <ol className="flex list-none items-center gap-1.5 p-0" aria-label="Progresso">
      {PASSOS.map((passo, i) => {
        const ativo = i === atual
        const concluido = i < atual
        return (
          <li key={passo} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex flex-1 flex-col gap-1.5",
                ativo ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 rounded-full transition-colors",
                  ativo || concluido ? "bg-primary" : "bg-muted"
                )}
              />
              <span className="hidden text-xs font-medium sm:block">
                {ROTULO_PASSO[passo]}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 1 — Preset + identidade                                               */
/* -------------------------------------------------------------------------- */

const CARDS_PRESET: { id: PiramidePresetId; titulo: string; desc: string }[] = [
  {
    id: "brasileirao",
    titulo: "Brasileirão",
    desc: "4 sobem · 4 caem por fronteira, desempate CBF.",
  },
  {
    id: "premier",
    titulo: "Premier League",
    desc: "3 sobem · 3 caem por fronteira, desempate inglês.",
  },
  {
    id: PRESET_PERSONALIZADO,
    titulo: "Personalizado",
    desc: "Você define divisões, tamanhos e fronteiras do zero.",
  },
]

function PassoPreset({
  nome,
  setNome,
  isPublic,
  setIsPublic,
  preset,
  onEscolher,
}: {
  nome: string
  setNome: (v: string) => void
  isPublic: boolean
  setIsPublic: (v: boolean) => void
  preset: PiramidePresetId | null
  onEscolher: (p: PiramidePresetId) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2">
        <Label htmlFor="liga-nome">Nome da pirâmide</Label>
        <Input
          id="liga-nome"
          autoComplete="off"
          placeholder="Ex.: Pirâmide da Várzea"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          A pirâmide é imortal: as temporadas se sucedem dentro dela.
        </p>
      </div>

      <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
        <legend className="pb-1 text-sm font-medium">Formato base</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {CARDS_PRESET.map((c) => {
            const selecionado = preset === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onEscolher(c.id)}
                aria-pressed={selecionado}
                className={cn(
                  "flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selecionado
                    ? "border-primary bg-primary/8 ring-1 ring-primary/40"
                    : "border-border hover:border-primary/40 hover:bg-accent/40"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg transition-colors",
                    selecionado ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Trophy className="size-5" />
                </span>
                <span className="text-sm leading-none font-medium">{c.titulo}</span>
                <span className="text-muted-foreground text-xs">{c.desc}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Partidas públicas</span>
          <span className="text-muted-foreground text-xs">
            Qualquer pessoa acompanha as partidas e os placares ao vivo. As
            divisões e a classificação ficam visíveis enquanto a temporada está
            em disputa.
          </span>
        </span>
      </label>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 2 — Divisões                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Campo de tamanho da divisão com estado de TEXTO local: permite limpar e
 * digitar (inclusive 2 dígitos) sem o valor saltar para o mínimo a cada tecla.
 * O clamp [2,20] e o commit ao estado-pai (que pode aparar competidores) só
 * acontecem no blur/Enter — nunca durante a digitação, evitando a perda
 * silenciosa de competidores ao esvaziar o campo.
 */
function CampoTamanhoDivisao({
  id,
  value,
  onCommit,
}: {
  id: string
  value: number
  onCommit: (n: number) => void
}) {
  const [texto, setTexto] = React.useState(String(value))
  // Reflete mudanças EXTERNAS do valor (preset, aparo) sem useEffect — padrão
  // React de ajuste de estado durante o render (compara o último valor visto).
  const [ultimoValue, setUltimoValue] = React.useState(value)
  if (value !== ultimoValue) {
    setUltimoValue(value)
    setTexto(String(value))
  }

  function commit() {
    const n = Number(texto)
    if (texto.trim() === "" || !Number.isFinite(n)) {
      setTexto(String(value)) // restaura o último válido
      return
    }
    const clamped = Math.max(
      DIVISAO_MIN_TAMANHO,
      Math.min(DIVISAO_MAX_TAMANHO, Math.round(n))
    )
    setTexto(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={DIVISAO_MIN_TAMANHO}
      max={DIVISAO_MAX_TAMANHO}
      step={1}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

function PassoDivisoes({
  divisoes,
  onAtualizar,
  onAdicionar,
  onRemover,
}: {
  divisoes: DivisaoRascunho[]
  onAtualizar: (idx: number, patch: Partial<DivisaoRascunho>) => void
  onAdicionar: () => void
  onRemover: (idx: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Nível 1 é o topo. Cada divisão é uma liga: defina o nome, o tamanho e se
        os competidores são clubes reais ou nomes livres.
      </p>

      <ul className="grid list-none gap-2.5 p-0">
        {divisoes.map((d, idx) => (
          <li
            key={d.nivel}
            className="animate-rise bg-card/60 flex flex-col gap-3 rounded-xl border p-3.5"
            style={{ "--stagger": `${idx * 45}ms` } as React.CSSProperties}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-primary/10 text-primary ring-primary/15 font-display flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ring-1"
              >
                {d.nivel}
              </span>
              <Input
                aria-label={`Nome da divisão ${d.nivel}`}
                value={d.nome}
                maxLength={60}
                placeholder={nomePadraoDivisao(d.nivel)}
                onChange={(e) => onAtualizar(idx, { nome: e.target.value })}
              />
              {divisoes.length > 1 && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onRemover(idx)}
                  aria-label={`Remover divisão ${d.nivel}`}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`tam-${d.nivel}`} className="text-xs">
                  Tamanho ({DIVISAO_MIN_TAMANHO}–{DIVISAO_MAX_TAMANHO})
                </Label>
                <CampoTamanhoDivisao
                  id={`tam-${d.nivel}`}
                  value={d.tamanho}
                  onCommit={(n) => onAtualizar(idx, { tamanho: n })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`des-${d.nivel}`} className="text-xs">
                  Desempate
                </Label>
                <select
                  id={`des-${d.nivel}`}
                  value={d.desempate}
                  onChange={(e) =>
                    onAtualizar(idx, {
                      desempate: e.target.value as DivisaoRascunho["desempate"],
                    })
                  }
                  className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
                >
                  {DESEMPATES_DISPONIVEIS.map((des) => (
                    <option key={des} value={des}>
                      {DESEMPATE_ROTULO[des]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors has-[:focus-visible]:ring-2">
              <input
                type="checkbox"
                checked={d.porNome}
                onChange={(e) => onAtualizar(idx, { porNome: e.target.checked })}
                className="border-input accent-primary size-4 rounded"
              />
              <span className="text-sm">
                Competidores por nome
                <span className="text-muted-foreground block text-xs font-normal">
                  Em vez de clubes reais, digite nomes livres (sem escudo, sem convite).
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      {divisoes.length < MAX_DIVISOES && (
        <Button
          type="button"
          variant="outline"
          onClick={onAdicionar}
          className="rounded-full"
        >
          <Plus aria-hidden="true" />
          Adicionar divisão
        </Button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 3 — Fronteiras                                                         */
/* -------------------------------------------------------------------------- */

function PassoFronteiras({
  divisoes,
  fronteiras,
  onAtualizar,
  finais,
  erro,
}: {
  divisoes: DivisaoRascunho[]
  fronteiras: FronteiraRascunho[]
  onAtualizar: (nivelSuperior: number, patch: Partial<FronteiraRascunho>) => void
  finais: Map<number, number>
  erro: string | null
}) {
  const porNivel = new Map(divisoes.map((d) => [d.nivel, d]))

  if (fronteiras.length === 0) {
    return (
      <div className="bg-muted/10 text-muted-foreground rounded-xl border border-dashed px-4 py-10 text-center text-sm">
        <Layers className="text-primary/70 mx-auto mb-3 size-7" aria-hidden="true" />
        Com uma única divisão não há acesso nem queda. Adicione outra divisão para
        configurar as fronteiras.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Quantos competidores sobem e caem em cada fronteira — o mesmo número dos
        dois lados, para os tamanhos das divisões ficarem estáveis entre
        temporadas. Na Fase 1 o corte é direto pela tabela.
      </p>

      <ul className="grid list-none gap-2.5 p-0">
        {fronteiras.map((f) => {
          const sup = porNivel.get(f.nivelSuperior)
          const inf = porNivel.get(f.nivelSuperior + 1)
          return (
            <li
              key={f.nivelSuperior}
              className="bg-card/60 flex flex-col gap-3 rounded-xl border p-3.5"
            >
              <p className="text-sm font-medium">
                {sup?.nome || nomePadraoDivisao(f.nivelSuperior)}
                <span className="text-muted-foreground"> ⇄ </span>
                {inf?.nome || nomePadraoDivisao(f.nivelSuperior + 1)}
              </p>

              {/* Fase 1: simetria obrigatória → um único campo define quantos
                  sobem E caem (mantém os tamanhos das divisões estáveis). */}
              <div className="grid gap-1.5">
                <Label htmlFor={`vagas-${f.nivelSuperior}`} className="text-xs">
                  Sobem e caem (mesmo número)
                </Label>
                <Input
                  id={`vagas-${f.nivelSuperior}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={f.vagasAcesso}
                  onChange={(e) => {
                    const v = Math.max(0, Math.round(Number(e.target.value) || 0))
                    onAtualizar(f.nivelSuperior, {
                      vagasAcesso: v,
                      vagasRebaixamento: v,
                    })
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="bg-muted/20 grid gap-1 rounded-lg border p-3 text-xs">
        <p className="text-muted-foreground font-medium">Tamanho após o sobe/cai</p>
        {divisoes.map((d) => {
          const pos = finais.get(d.nivel) ?? d.tamanho
          const ok = pos >= DIVISAO_MIN_TAMANHO && pos <= DIVISAO_MAX_TAMANHO
          return (
            <p
              key={d.nivel}
              className={cn("flex justify-between", ok ? "" : "text-destructive font-medium")}
            >
              <span>{d.nome || nomePadraoDivisao(d.nivel)}</span>
              <span className="font-display tabular-nums">
                {d.tamanho} → {pos}
              </span>
            </p>
          )
        })}
      </div>

      {erro && (
        <p className="text-destructive text-sm" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Passo 4 — Competidores por divisão                                          */
/* -------------------------------------------------------------------------- */

function PassoCompetidores({
  divisoes,
  divisaoAtiva,
  setDivisaoAtiva,
  onAdicionar,
  onRemover,
}: {
  divisoes: DivisaoRascunho[]
  divisaoAtiva: number
  setDivisaoAtiva: (i: number) => void
  onAdicionar: (divIdx: number, comp: CompetidorRascunho) => void
  onRemover: (divIdx: number, compIdx: number) => void
}) {
  const idx = Math.min(divisaoAtiva, divisoes.length - 1)
  const div = divisoes[idx]

  return (
    <div className="flex flex-col gap-4">
      {/* Abas de divisão (rolagem horizontal no mobile). */}
      {divisoes.length > 1 && (
        <div
          role="tablist"
          aria-label="Divisões"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {divisoes.map((d, i) => {
            const completa = d.competidores.length === d.tamanho
            const ativa = i === idx
            return (
              <button
                key={d.nivel}
                id={`tab-comp-${d.nivel}`}
                role="tab"
                aria-selected={ativa}
                aria-controls="painel-competidores"
                tabIndex={ativa ? 0 : -1}
                type="button"
                onClick={() => setDivisaoAtiva(i)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  ativa
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {completa && <Check className="size-3" aria-hidden="true" />}
                {d.nome || nomePadraoDivisao(d.nivel)}
              </button>
            )
          })}
        </div>
      )}

      {div && (
        <DivisaoCompetidores
          key={div.nivel}
          divIdx={idx}
          div={div}
          // Vincula o painel à aba ativa (só quando há abas/tablist).
          painelTabId={divisoes.length > 1 ? `tab-comp-${div.nivel}` : undefined}
          onAdicionar={onAdicionar}
          onRemover={onRemover}
        />
      )}
    </div>
  )
}

function DivisaoCompetidores({
  divIdx,
  div,
  painelTabId,
  onAdicionar,
  onRemover,
}: {
  divIdx: number
  div: DivisaoRascunho
  /** Id da aba que rotula este painel (tabpanel) — ausente quando não há abas. */
  painelTabId?: string
  onAdicionar: (divIdx: number, comp: CompetidorRascunho) => void
  onRemover: (divIdx: number, compIdx: number) => void
}) {
  const [adicionando, startTransition] = React.useTransition()
  const [texto, setTexto] = React.useState("")
  const cheia = div.competidores.length >= div.tamanho

  function adicionarClube(team: TeamResult) {
    if (cheia) {
      toast.error(`A divisão já tem ${div.tamanho} clubes.`)
      return
    }
    if (
      div.competidores.some(
        (c) => c.tipo === "clube" && c.externalId === team.externalId
      )
    ) {
      toast.error("Esse clube já está nesta divisão.")
      return
    }
    startTransition(async () => {
      const r = await selectTeam({
        externalId: team.externalId,
        nome: team.nome,
        escudoUrl: team.escudoUrl,
      })
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      onAdicionar(divIdx, {
        tipo: "clube",
        teamId: r.teamId,
        nome: team.nome,
        escudo: team.escudoUrl ?? undefined,
        externalId: team.externalId,
      })
    })
  }

  function adicionarNome() {
    const rotulo = texto.trim()
    if (!rotulo) return
    if (cheia) {
      toast.error(`A divisão já tem ${div.tamanho} competidores.`)
      return
    }
    if (
      div.competidores.some(
        (c) => c.tipo === "nome" && c.rotulo.toLowerCase() === rotulo.toLowerCase()
      )
    ) {
      toast.error("Esse nome já está nesta divisão.")
      return
    }
    onAdicionar(divIdx, { tipo: "nome", rotulo })
    setTexto("")
  }

  return (
    <div
      className="flex flex-col gap-3"
      {...(painelTabId
        ? { id: "painel-competidores", role: "tabpanel", "aria-labelledby": painelTabId }
        : {})}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold">
          {div.nome || nomePadraoDivisao(div.nivel)}
        </h3>
        <span
          className={cn(
            "text-xs font-medium",
            cheia ? "text-primary" : "text-muted-foreground"
          )}
        >
          {div.competidores.length} / {div.tamanho}
        </span>
      </div>

      {div.porNome ? (
        <div className="flex gap-2">
          <Input
            aria-label="Nome do competidor"
            placeholder="Ex.: João"
            value={texto}
            maxLength={80}
            disabled={cheia}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                adicionarNome()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={adicionarNome} disabled={cheia}>
            Adicionar
          </Button>
        </div>
      ) : (
        <TeamSearchInput
          label="Buscar clube"
          placeholder={adicionando ? "Adicionando…" : cheia ? "Divisão cheia" : "Buscar clube…"}
          onSelect={adicionarClube}
        />
      )}

      {div.competidores.length > 0 ? (
        <ul className="grid list-none gap-2 p-0">
          {div.competidores.map((c, i) => (
            <li
              key={c.tipo === "clube" ? `c-${c.teamId}` : `n-${c.rotulo}-${i}`}
              className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                {c.tipo === "clube" ? (
                  <TeamCrest nome={c.nome} escudoUrl={c.escudo ?? null} size={22} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="bg-muted text-muted-foreground flex size-[22px] items-center justify-center rounded-full text-[0.65rem] font-bold"
                  >
                    {c.rotulo.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm">
                  {c.tipo === "clube" ? c.nome : c.rotulo}
                </span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => onRemover(divIdx, i)}
                aria-label={`Remover ${c.tipo === "clube" ? c.nome : c.rotulo}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
          {div.porNome
            ? "Nenhum competidor adicionado ainda."
            : "Nenhum clube adicionado ainda."}
        </p>
      )}
    </div>
  )
}
