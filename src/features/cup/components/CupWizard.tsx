"use client"

import { ArrowLeft, ArrowRight, Check, Trophy } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { criarCopa } from "@/actions/cups"
import { Button } from "@/components/ui/button"
import { ColorField } from "@/components/ui/color-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { MATA_MATA_MAX_PARTICIPANTES } from "@/features/knockout/gerarChaveMataMata"
import {
  ABRANGENCIAS_DISPONIVEIS,
  DESEMPATES_COPA_DISPONIVEIS,
  ehPotenciaDe2,
  FORMATOS_COPA_DISPONIVEIS,
  type CupInput,
} from "@/schema/cupSchema"
import { CUP_FORMAT_LABEL, CUP_SCOPE_LABEL } from "@/features/cup/cupLabels"
import {
  erroRegras,
  regraParaInput,
  RuleListEditor,
  type OrigemCopa,
  type OrigemPiramide,
  type RegraRascunho,
} from "@/features/cup/components/RuleListEditor"

export type { OrigemCopa, OrigemPiramide }

export interface CupWizardProps {
  piramides: OrigemPiramide[]
  copas: OrigemCopa[]
}

const SELECT_CLASSE =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"

const DESEMPATE_ROTULO: Record<(typeof DESEMPATES_COPA_DISPONIVEIS)[number], string> = {
  cbf: "CBF (vitórias, saldo, gols pró)",
  ingles: "Inglês (saldo, gols pró, vitórias)",
  espanhol: "Espanhol (confronto entre empatados, depois saldo)",
  fifa: "FIFA (saldo, gols pró, depois confronto)",
}

/** Nº de grupos (≥2) oferecidos; só os que admitem alguma chave válida ≤32. */
const GRUPOS_OPCOES = [2, 4, 8, 16] as const

/** K (classificados por grupo) válidos: produto = chave completa (potência de 2). */
function classificadosValidos(qtdGrupos: number): number[] {
  const out: number[] = []
  for (let k = 1; k * qtdGrupos <= MATA_MATA_MAX_PARTICIPANTES; k++) {
    const produto = qtdGrupos * k
    if (produto >= 2 && ehPotenciaDe2(produto)) out.push(k)
  }
  return out
}

/** Primeira geometria válida (menor nº de grupos, maior K). */
function defaultGeometria(): { qtdGrupos: number; classificadosPorGrupo: number } {
  for (const g of GRUPOS_OPCOES) {
    const ks = classificadosValidos(g)
    if (ks.length > 0) return { qtdGrupos: g, classificadosPorGrupo: ks[ks.length - 1] }
  }
  return { qtdGrupos: 2, classificadosPorGrupo: 1 }
}

type Formato = (typeof FORMATOS_COPA_DISPONIVEIS)[number]
type Abrangencia = (typeof ABRANGENCIAS_DISPONIVEIS)[number]
type Desempate = (typeof DESEMPATES_COPA_DISPONIVEIS)[number]

const PASSOS = ["identidade", "regras", "revisao"] as const
type Passo = (typeof PASSOS)[number]

const ROTULO_PASSO: Record<Passo, string> = {
  identidade: "Formato",
  regras: "Qualificação",
  revisao: "Revisão",
}

export function CupWizard({ piramides, copas }: CupWizardProps) {
  const router = useRouter()

  const [passoAtual, setPassoAtual] = React.useState<Passo>("identidade")
  const [nome, setNome] = React.useState("")
  const [abrangencia, setAbrangencia] = React.useState<Abrangencia>("nacional")
  const [formato, setFormato] = React.useState<Formato>("mata_mata")
  const [qtdGrupos, setQtdGrupos] = React.useState<number>(() => defaultGeometria().qtdGrupos)
  const [classificadosPorGrupo, setClassificadosPorGrupo] = React.useState<number>(
    () => defaultGeometria().classificadosPorGrupo
  )
  const [porNome, setPorNome] = React.useState(false)
  const [idaEVolta, setIdaEVolta] = React.useState(false)
  const [terceiroLugar, setTerceiroLugar] = React.useState(false)
  const [desempateCriterio, setDesempateCriterio] = React.useState<Desempate>("cbf")
  const [isPublic, setIsPublic] = React.useState(true)
  const [corPrimaria, setCorPrimaria] = React.useState("")
  const [corSecundaria, setCorSecundaria] = React.useState("")
  const [regras, setRegras] = React.useState<RegraRascunho[]>([])
  const [enviando, startTransition] = React.useTransition()

  const indicePasso = PASSOS.indexOf(passoAtual)
  const ehGrupos = formato === "grupos_mata_mata"
  const erroDasRegras = erroRegras(regras, piramides)

  function trocarFormato(f: Formato) {
    setFormato(f)
    if (f === "grupos_mata_mata") {
      const def = defaultGeometria()
      setQtdGrupos(def.qtdGrupos)
      setClassificadosPorGrupo(def.classificadosPorGrupo)
    }
  }

  function trocarGrupos(g: number) {
    setQtdGrupos(g)
    const ks = classificadosValidos(g)
    if (!ks.includes(classificadosPorGrupo)) {
      setClassificadosPorGrupo(ks[ks.length - 1] ?? 1)
    }
  }

  const podeAvancar = ((): boolean => {
    if (passoAtual === "identidade") return nome.trim().length >= 2
    if (passoAtual === "regras") return erroDasRegras === null
    return true
  })()

  function avancar() {
    if (!podeAvancar) return
    setPassoAtual(PASSOS[Math.min(indicePasso + 1, PASSOS.length - 1)])
  }
  function voltar() {
    setPassoAtual(PASSOS[Math.max(indicePasso - 1, 0)])
  }

  const corOuUndefined = (v: string) => (v.trim() === "" ? undefined : v)

  function montarCopaInput(): CupInput {
    return {
      nome: nome.trim(),
      abrangencia,
      formato,
      porNome,
      idaEVolta,
      terceiroLugar,
      qtdGrupos: ehGrupos ? qtdGrupos : undefined,
      classificadosPorGrupo: ehGrupos ? classificadosPorGrupo : undefined,
      desempateCriterio,
      isPublic,
      corPrimaria: corOuUndefined(corPrimaria),
      corSecundaria: corOuUndefined(corSecundaria),
    }
  }

  function enviar() {
    startTransition(async () => {
      const r = await criarCopa({
        copa: montarCopaInput(),
        regras: regras.map(regraParaInput),
      })
      if (r.cupId) {
        toast.success("Copa criada! Hora de abrir a primeira edição.")
        router.push(`/dashboard/copas/${r.cupId}`)
        return
      }
      if (r.fieldErrors) {
        const primeiro = Object.values(r.fieldErrors).find((v) => v && v.length > 0)
        toast.error(primeiro?.[0] ?? r.error ?? "Verifique os campos e tente de novo.")
        return
      }
      toast.error(r.error ?? "Não foi possível criar a copa agora.")
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PassosNav atual={indicePasso} />

      <div key={passoAtual} className="animate-rise flex flex-col gap-5">
        {passoAtual === "identidade" && (
          <PassoIdentidade
            nome={nome}
            setNome={setNome}
            abrangencia={abrangencia}
            setAbrangencia={setAbrangencia}
            formato={formato}
            trocarFormato={trocarFormato}
            ehGrupos={ehGrupos}
            qtdGrupos={qtdGrupos}
            trocarGrupos={trocarGrupos}
            classificadosPorGrupo={classificadosPorGrupo}
            setClassificadosPorGrupo={setClassificadosPorGrupo}
            porNome={porNome}
            setPorNome={setPorNome}
            idaEVolta={idaEVolta}
            setIdaEVolta={setIdaEVolta}
            terceiroLugar={terceiroLugar}
            setTerceiroLugar={setTerceiroLugar}
            desempateCriterio={desempateCriterio}
            setDesempateCriterio={setDesempateCriterio}
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            corPrimaria={corPrimaria}
            setCorPrimaria={setCorPrimaria}
            corSecundaria={corSecundaria}
            setCorSecundaria={setCorSecundaria}
          />
        )}

        {passoAtual === "regras" && (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              As vagas saem da classificação final encerrada das suas origens. Cada
              regra pega uma faixa de posições de uma divisão de pirâmide ou de outra
              copa. A prioridade resolve disputas de vaga (menor primeiro).
            </p>
            <RuleListEditor
              regras={regras}
              setRegras={setRegras}
              piramides={piramides}
              copas={copas}
            />
            {erroDasRegras && (
              <p className="text-destructive text-sm" role="alert">
                {erroDasRegras}
              </p>
            )}
          </div>
        )}

        {passoAtual === "revisao" && (
          <PassoRevisao
            nome={nome}
            abrangencia={abrangencia}
            formato={formato}
            ehGrupos={ehGrupos}
            qtdGrupos={qtdGrupos}
            classificadosPorGrupo={classificadosPorGrupo}
            porNome={porNome}
            idaEVolta={idaEVolta}
            terceiroLugar={terceiroLugar}
            isPublic={isPublic}
            regras={regras}
            piramides={piramides}
            copas={copas}
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

        {passoAtual === "revisao" ? (
          <Button
            type="button"
            size="lg"
            onClick={enviar}
            disabled={enviando}
            className="rounded-full"
          >
            <Check aria-hidden="true" />
            {enviando ? "Criando…" : "Criar copa"}
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

const CARDS_FORMATO: { id: Formato; titulo: string; desc: string }[] = [
  {
    id: "mata_mata",
    titulo: "Mata-mata",
    desc: "Chave eliminatória direta (2 a 32 participantes).",
  },
  {
    id: "grupos_mata_mata",
    titulo: "Grupos + mata-mata",
    desc: "Fase de grupos classifica para a chave final.",
  },
]

function PassoIdentidade(props: {
  nome: string
  setNome: (v: string) => void
  abrangencia: Abrangencia
  setAbrangencia: (v: Abrangencia) => void
  formato: Formato
  trocarFormato: (f: Formato) => void
  ehGrupos: boolean
  qtdGrupos: number
  trocarGrupos: (g: number) => void
  classificadosPorGrupo: number
  setClassificadosPorGrupo: (k: number) => void
  porNome: boolean
  setPorNome: (v: boolean) => void
  idaEVolta: boolean
  setIdaEVolta: (v: boolean) => void
  terceiroLugar: boolean
  setTerceiroLugar: (v: boolean) => void
  desempateCriterio: Desempate
  setDesempateCriterio: (v: Desempate) => void
  isPublic: boolean
  setIsPublic: (v: boolean) => void
  corPrimaria: string
  setCorPrimaria: (v: string) => void
  corSecundaria: string
  setCorSecundaria: (v: string) => void
}) {
  const ksOpcoes = classificadosValidos(props.qtdGrupos)
  const totalChave = props.qtdGrupos * props.classificadosPorGrupo

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2">
        <Label htmlFor="copa-nome">Nome da copa</Label>
        <Input
          id="copa-nome"
          autoComplete="off"
          placeholder="Ex.: Copa da Várzea"
          value={props.nome}
          maxLength={80}
          onChange={(e) => props.setNome(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          A copa é imortal: as edições se sucedem, alimentadas pela classificação das
          suas ligas e copas.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="copa-abrangencia">Abrangência</Label>
        <select
          id="copa-abrangencia"
          value={props.abrangencia}
          onChange={(e) => props.setAbrangencia(e.target.value as Abrangencia)}
          className={SELECT_CLASSE}
        >
          {ABRANGENCIAS_DISPONIVEIS.map((a) => (
            <option key={a} value={a}>
              {CUP_SCOPE_LABEL[a]}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Apenas um rótulo. Continental costuma reunir origens de várias pirâmides.
        </p>
      </div>

      <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
        <legend className="pb-1 text-sm font-medium">Formato</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {CARDS_FORMATO.map((c) => {
            const selecionado = props.formato === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => props.trocarFormato(c.id)}
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
                    selecionado
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
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

      {props.ehGrupos && (
        <div className="bg-card/60 grid gap-3 rounded-xl border p-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="copa-grupos" className="text-xs">
                Grupos
              </Label>
              <select
                id="copa-grupos"
                value={props.qtdGrupos}
                onChange={(e) => props.trocarGrupos(Number(e.target.value))}
                className={SELECT_CLASSE}
              >
                {GRUPOS_OPCOES.map((g) => (
                  <option key={g} value={g}>
                    {g} grupos
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="copa-classificados" className="text-xs">
                Classificados por grupo
              </Label>
              <select
                id="copa-classificados"
                value={props.classificadosPorGrupo}
                onChange={(e) => props.setClassificadosPorGrupo(Number(e.target.value))}
                className={SELECT_CLASSE}
              >
                {ksOpcoes.map((k) => (
                  <option key={k} value={k}>
                    {k} {k === 1 ? "classificado" : "classificados"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            A fase de grupos classifica {totalChave} para a chave final. O número de
            participantes precisa fechar exatamente os grupos.
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="copa-desempate">Desempate da fase de grupos</Label>
        <select
          id="copa-desempate"
          value={props.desempateCriterio}
          onChange={(e) => props.setDesempateCriterio(e.target.value as Desempate)}
          className={SELECT_CLASSE}
        >
          {DESEMPATES_COPA_DISPONIVEIS.map((d) => (
            <option key={d} value={d}>
              {DESEMPATE_ROTULO[d]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
        <legend className="pb-1 text-sm font-medium">Identidade (opcional)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorField
            label="Cor primária"
            value={props.corPrimaria}
            onChange={props.setCorPrimaria}
          />
          <ColorField
            label="Cor secundária"
            value={props.corSecundaria}
            onChange={props.setCorSecundaria}
            description="Vazio usa o tema do app."
          />
        </div>
      </fieldset>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={props.porNome}
          onChange={(e) => props.setPorNome(e.target.checked)}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Participantes por nome</span>
          <span className="text-muted-foreground text-xs">
            Em vez de clubes reais, nomes livres (sem escudo). As origens precisam ser
            do mesmo tipo.
          </span>
        </span>
      </label>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={props.idaEVolta}
          onChange={(e) => props.setIdaEVolta(e.target.checked)}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Ida e volta</span>
          <span className="text-muted-foreground text-xs">
            Cada confronto da chave em dois jogos (a final é sempre jogo único).
          </span>
        </span>
      </label>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={props.terceiroLugar}
          onChange={(e) => props.setTerceiroLugar(e.target.checked)}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Disputa de 3º lugar</span>
          <span className="text-muted-foreground text-xs">
            Os semifinalistas perdedores jogam por 3º e 4º lugares.
          </span>
        </span>
      </label>

      <label className="bg-card/40 hover:border-primary/40 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2">
        <input
          type="checkbox"
          checked={props.isPublic}
          onChange={(e) => props.setIsPublic(e.target.checked)}
          className="border-input accent-primary size-4 rounded"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm">Copa pública</span>
          <span className="text-muted-foreground text-xs">
            Qualquer pessoa acompanha as edições, a chave e os placares ao vivo.
          </span>
        </span>
      </label>
    </div>
  )
}

function PassoRevisao({
  nome,
  abrangencia,
  formato,
  ehGrupos,
  qtdGrupos,
  classificadosPorGrupo,
  porNome,
  idaEVolta,
  terceiroLugar,
  isPublic,
  regras,
  piramides,
  copas,
}: {
  nome: string
  abrangencia: Abrangencia
  formato: Formato
  ehGrupos: boolean
  qtdGrupos: number
  classificadosPorGrupo: number
  porNome: boolean
  idaEVolta: boolean
  terceiroLugar: boolean
  isPublic: boolean
  regras: RegraRascunho[]
  piramides: OrigemPiramide[]
  copas: OrigemCopa[]
}) {
  function descreverOrigem(r: RegraRascunho): string {
    if (r.origemTipo === "divisao") {
      const p = piramides.find((x) => x.id === r.origemCompetitionId)
      return `${p?.nome ?? "Pirâmide"} · nível ${r.origemNivel}`
    }
    const c = copas.find((x) => x.id === r.origemCupId)
    return c?.nome ?? "Copa"
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card/60 grid gap-2 rounded-xl border p-4">
        <h3 className="font-display text-base font-bold">{nome.trim() || "Copa"}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Chip>{CUP_SCOPE_LABEL[abrangencia]}</Chip>
          <Chip>{CUP_FORMAT_LABEL[formato]}</Chip>
          {ehGrupos ? (
            <Chip>
              {qtdGrupos} grupos · {classificadosPorGrupo} por grupo
            </Chip>
          ) : null}
          {porNome ? <Chip>por nome</Chip> : <Chip>por clube</Chip>}
          {idaEVolta ? <Chip>ida e volta</Chip> : null}
          {terceiroLugar ? <Chip>3º lugar</Chip> : null}
          <Chip>{isPublic ? "pública" : "privada"}</Chip>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Regras de qualificação ({regras.length})</p>
        {regras.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-sm">
            Sem regras. Você pode adicionar depois, na página da copa.
          </p>
        ) : (
          <ul className="grid list-none gap-2 p-0">
            {regras.map((r) => {
              const numVagas = Math.max(0, r.posicaoFim - r.posicaoInicio + 1)
              return (
                <li
                  key={r.key}
                  className="bg-card flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{descreverOrigem(r)}</span>
                    <span className="text-muted-foreground">
                      {` · ${r.posicaoInicio}º a ${r.posicaoFim}º (${numVagas} ${numVagas === 1 ? "vaga" : "vagas"})`}
                    </span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    prio. {r.prioridade}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Depois de criar, abra uma edição: derive as vagas das origens encerradas,
        ajuste os participantes e monte a chave.
      </p>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}
