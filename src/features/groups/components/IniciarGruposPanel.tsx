"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

import { iniciarTorneioGrupos, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  GRUPOS_VALIDOS,
  previaGrupos,
  rotuloGrupo,
  TOTAIS_CHAVE_VALIDOS,
} from "@/features/groups/gerarFaseDeGrupos"
import { MATA_MATA_MAX_PARTICIPANTES } from "@/features/knockout/gerarChaveMataMata"

const initialState: TournamentFormState = {}

interface Participante {
  id: string
  nome: string | null
}

function nomeOuFallback(nome: string | null): string {
  return nome?.trim() || "Sem nome"
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Gerando grupos…" : "Iniciar torneio"}
    </Button>
  )
}

/**
 * Combinações G/K válidas para o N atual (mesmas regras do motor). Em
 * grupos_mata_mata o painel só oferece G >= 2 — grupo único é o formato
 * Fase de liga (a action espelha a regra).
 */
function opcoesValidas(qtd: number, faseLiga: boolean) {
  const opcoes: { g: number; k: number }[] = []
  const gruposPossiveis = faseLiga
    ? [1]
    : (GRUPOS_VALIDOS as readonly number[]).filter((g) => g >= 2)
  for (const g of gruposPossiveis) {
    const menorGrupo = Math.floor(qtd / g)
    if (menorGrupo < 2) continue
    for (const total of TOTAIS_CHAVE_VALIDOS) {
      if (total % g !== 0) continue
      const k = total / g
      if (k >= 1 && k < menorGrupo) opcoes.push({ g, k })
    }
  }
  return opcoes
}

/**
 * Painel "Iniciar torneio" dos formatos de GRUPOS (Copa) e FASE DE LIGA
 * (Champions — G fixo em 1). Client por necessidade: G/K/modo são progressive
 * disclosure e viajam no MESMO form da action. Prévia da MESMA fonte do motor
 * (`previaGrupos`); validação real na action + motor + RLS + índice único.
 */
export function IniciarGruposPanel({
  tournamentId,
  participantes,
  idaEVolta,
  terceiroLugar,
  faseLiga,
}: {
  tournamentId: string
  participantes: Participante[]
  idaEVolta: boolean
  terceiroLugar: boolean
  /** Formato fase_liga: grupo único (G = 1 fixo). */
  faseLiga: boolean
}) {
  const [state, formAction] = useActionState(iniciarTorneioGrupos, initialState)
  const qtd = participantes.length
  const opcoes = opcoesValidas(qtd, faseLiga)
  const gruposDisponiveis = [...new Set(opcoes.map((o) => o.g))]

  // Estado inicial DERIVADO das opções válidas (achado da validação
  // adversarial: defaults fixos G=2/K=2 travavam o painel quando inválidos
  // para o N atual — o submit nascia desabilitado sem caminho de destrave).
  const [qtdGrupos, setQtdGrupos] = useState(
    () => gruposDisponiveis[0] ?? (faseLiga ? 1 : 2)
  )
  const [classificados, setClassificados] = useState(
    () => opcoes.find((o) => o.g === (gruposDisponiveis[0] ?? 1))?.k ?? 2
  )
  const [modo, setModo] = useState<"sorteio" | "potes" | "manual">("sorteio")

  // Valores EFETIVOS derivados no render (sem effect): o nº de participantes
  // muda entre renders (convites aceitos/saídas) e pode invalidar a escolha
  // guardada — o render corrige para a primeira combinação válida; os selects
  // submetem os valores efetivos.
  const gEfetivo = gruposDisponiveis.includes(qtdGrupos)
    ? qtdGrupos
    : (gruposDisponiveis[0] ?? qtdGrupos)
  const ksDoGrupo = opcoes.filter((o) => o.g === gEfetivo).map((o) => o.k)
  const kEfetivo = ksDoGrupo.includes(classificados)
    ? classificados
    : (ksDoGrupo[0] ?? classificados)
  const configuracaoValida = opcoes.some(
    (o) => o.g === gEfetivo && o.k === kEfetivo
  )
  const suficientes = qtd >= 2
  const dentroDoLimite = qtd <= MATA_MATA_MAX_PARTICIPANTES
  const previa = configuracaoValida
    ? previaGrupos(qtd, gEfetivo, kEfetivo, idaEVolta, terceiroLugar)
    : null

  const rotuloFase1 = faseLiga ? "Fase de liga" : "Fase de grupos"

  return (
    <section
      aria-labelledby="iniciar-titulo"
      className="flex flex-col gap-3 rounded-lg border px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="iniciar-titulo" className="text-lg font-semibold">
          Iniciar torneio
        </h2>
        <p className="text-muted-foreground text-sm">
          {`${faseLiga ? "Fase de liga" : "Grupos + mata-mata"} em rascunho • ${qtd} ${qtd === 1 ? "participante confirmado" : "participantes confirmados"}${idaEVolta ? " • ida e volta" : ""}${terceiroLugar ? " • com 3º lugar" : ""}`}
        </p>
      </div>

      {!suficientes ? (
        <p className="text-muted-foreground text-sm" role="status">
          O torneio precisa de pelo menos 2 participantes confirmados.
          Compartilhe o link de convite abaixo para chamar os jogadores.
        </p>
      ) : !dentroDoLimite ? (
        <p className="text-destructive text-sm" role="alert">
          {`O torneio aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes. Remova participantes para iniciar.`}
        </p>
      ) : opcoes.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          {`Com ${qtd} participantes não há configuração válida de ${faseLiga ? "classificados" : "grupos e classificados"}. Convide mais jogadores.`}
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          <input type="hidden" name="tournamentId" value={tournamentId} />
          {faseLiga ? <input type="hidden" name="qtdGrupos" value={1} /> : null}

          <div className="grid grid-cols-2 gap-3">
            {!faseLiga ? (
              <div className="grid gap-2">
                <Label htmlFor="qtdGrupos">Grupos</Label>
                <select
                  id="qtdGrupos"
                  name="qtdGrupos"
                  value={gEfetivo}
                  onChange={(e) => {
                    const g = Number(e.target.value)
                    setQtdGrupos(g)
                    // K atual pode não valer para o novo G — salta direto
                    // para o primeiro válido (sem flicker de estado inválido).
                    if (!opcoes.some((o) => o.g === g && o.k === kEfetivo)) {
                      const k = opcoes.find((o) => o.g === g)?.k
                      if (k !== undefined) setClassificados(k)
                    }
                  }}
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                >
                  {gruposDisponiveis.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="classificadosPorGrupo">
                {faseLiga ? "Classificados" : "Classificam por grupo"}
              </Label>
              <select
                id="classificadosPorGrupo"
                name="classificadosPorGrupo"
                value={kEfetivo}
                onChange={(e) => setClassificados(Number(e.target.value))}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                {ksDoGrupo.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {previa ? (
            <p className="text-sm">
              {`Ao iniciar: ${previa.jogosGrupos} ${previa.jogosGrupos === 1 ? "jogo" : "jogos"} na ${rotuloFase1.toLowerCase()} (${previa.rodadasGrupos} ${previa.rodadasGrupos === 1 ? "rodada" : "rodadas"}); depois, mata-mata com ${previa.jogosChave} ${previa.jogosChave === 1 ? "jogo" : "jogos"} em ${previa.fasesChave} ${previa.fasesChave === 1 ? "fase" : "fases"}. Depois disso ninguém mais entra no torneio.`}
            </p>
          ) : (
            <p className="text-destructive text-sm" role="alert">
              Combinação de grupos e classificados inválida para o número de
              participantes.
            </p>
          )}

          {/* border-0/p-0/m-0/min-w-0: o preflight do Tailwind v4 NÃO reseta
              fieldset/legend (mesma decisão do TournamentForm). */}
          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
            <legend className="pb-2 text-sm font-medium">
              {faseLiga ? "Ordem dos confrontos" : "Distribuição nos grupos"}
            </legend>
            <div className="flex items-start gap-2">
              <input
                id="modoSorteio"
                name="modo"
                type="radio"
                value="sorteio"
                checked={modo === "sorteio"}
                onChange={() => setModo("sorteio")}
                className="accent-primary mt-1 size-4"
              />
              <Label htmlFor="modoSorteio" className="flex-col items-start gap-0.5 font-normal">
                Sorteio
                <span className="text-muted-foreground text-xs font-normal">
                  {faseLiga
                    ? "A ordem da tabela é sorteada automaticamente."
                    : "Os grupos são sorteados automaticamente."}
                </span>
              </Label>
            </div>
            {!faseLiga ? (
              <>
                <div className="flex items-start gap-2">
                  <input
                    id="modoPotes"
                    name="modo"
                    type="radio"
                    value="potes"
                    checked={modo === "potes"}
                    onChange={() => setModo("potes")}
                    className="accent-primary mt-1 size-4"
                  />
                  <Label htmlFor="modoPotes" className="flex-col items-start gap-0.5 font-normal">
                    Sorteio com potes
                    <span className="text-muted-foreground text-xs font-normal">
                      {`Marque ${gEfetivo} cabeças de chave — uma cai em cada grupo.`}
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="modoManual"
                    name="modo"
                    type="radio"
                    value="manual"
                    checked={modo === "manual"}
                    onChange={() => setModo("manual")}
                    className="accent-primary mt-1 size-4"
                  />
                  <Label htmlFor="modoManual" className="flex-col items-start gap-0.5 font-normal">
                    Montagem manual
                    <span className="text-muted-foreground text-xs font-normal">
                      Você escolhe o grupo de cada participante (equilíbrio
                      máximo de 1 de diferença).
                    </span>
                  </Label>
                </div>
              </>
            ) : null}
          </fieldset>

          {modo === "potes" && !faseLiga ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="pb-2 text-sm font-medium">
                {`Cabeças de chave (marque ${gEfetivo})`}
              </legend>
              {participantes.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <input
                    id={`cabeca-${p.id}`}
                    name="cabecas"
                    type="checkbox"
                    value={p.id}
                    className="border-input accent-primary size-4 rounded"
                  />
                  <Label htmlFor={`cabeca-${p.id}`} className="font-normal">
                    {nomeOuFallback(p.nome)}
                  </Label>
                </div>
              ))}
            </fieldset>
          ) : null}

          {modo === "manual" && !faseLiga ? (
            <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
              <legend className="pb-2 text-sm font-medium">
                Grupo de cada participante
              </legend>
              {participantes.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-2"
                >
                  <Label htmlFor={`grupo-${p.id}`} className="font-normal">
                    {nomeOuFallback(p.nome)}
                  </Label>
                  <select
                    id={`grupo-${p.id}`}
                    name={`grupo_de_${p.id}`}
                    defaultValue="1"
                    className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  >
                    {Array.from({ length: gEfetivo }, (_, i) => i + 1).map((g) => (
                      <option key={g} value={g}>
                        {rotuloGrupo(g)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </fieldset>
          ) : null}

          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}

          <div>
            <SubmitButton disabled={!configuracaoValida} />
          </div>
        </form>
      )}
    </section>
  )
}
