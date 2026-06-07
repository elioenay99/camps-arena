import { Trophy } from "lucide-react"

import {
  decidirConfronto,
  ehTerceiroLugar,
  rodadaBaseDaChave,
  rotuloFase,
  tamanhoChaveDasPartidas,
  totalFases,
} from "@/features/knockout/gerarChaveMataMata"
import type { PartidaDaChave } from "@/features/standings/data/getTournamentClassificacao"

/**
 * Confronto de um slot: 1 partida (jogo único/bye) ou 2 (pernas). Decisão e
 * rótulos vêm do MOTOR (decidirConfronto/rotuloFase) — fonte única com a
 * geração; a view nunca recalcula regra de agregado.
 */
interface Confronto {
  posicao: number
  partidas: PartidaDaChave[]
  terceiroLugar: boolean
}

function nomeDoVencedor(confronto: Confronto): string | null {
  const resultado = decidirConfronto(confronto.partidas)
  if (!resultado) return null
  for (const p of confronto.partidas) {
    if (p.participante_1 === resultado.vencedor) return p.nome_1
    if (p.participante_2 === resultado.vencedor) return p.nome_2
  }
  return null
}

function LinhaLado({
  nome,
  placar,
  venceu,
  encerrada,
}: {
  nome: string
  placar: number
  venceu: boolean
  encerrada: boolean
}) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className={`truncate ${venceu ? "text-primary font-semibold" : ""}`}>
        {nome}
      </span>
      <span
        className={`shrink-0 font-display tabular-nums ${encerrada ? "font-bold" : "text-muted-foreground"}`}
      >
        {placar}
      </span>
    </span>
  )
}

function ConfrontoCard({ confronto }: { confronto: Confronto }) {
  const resultado = decidirConfronto(confronto.partidas)
  const vencedorId = resultado?.vencedor ?? null
  const unica = confronto.partidas[0]
  const ehBye = confronto.partidas.length === 1 && unica.participante_2 === null

  return (
    <div className="flex w-56 flex-col gap-1 rounded-lg border px-3 py-2 text-sm motion-safe:transition-colors hover:border-primary/30">
      {confronto.terceiroLugar ? (
        <span className="mb-0.5 w-fit rounded-full border border-gold/30 px-2 py-0.5 text-xs font-medium text-gold">
          Disputa de 3º lugar
        </span>
      ) : null}
      {ehBye ? (
        <>
          <span className="text-primary truncate font-semibold">{unica.nome_1}</span>
          <span className="text-muted-foreground text-xs">
            Avança direto (bye)
          </span>
        </>
      ) : (
        confronto.partidas.map((p) => {
          const encerrada = p.status === "encerrada"
          return (
            <div key={p.id} className="flex flex-col">
              {p.perna !== null || p.wo ? (
                <span className="text-muted-foreground text-xs">
                  {p.perna !== null ? (p.perna === 1 ? "Ida" : "Volta") : ""}
                  {p.perna !== null && p.wo ? " · " : ""}
                  {p.wo ? "W.O." : ""}
                </span>
              ) : null}
              <LinhaLado
                nome={p.nome_1}
                placar={p.placar_1}
                venceu={encerrada && vencedorId !== null && p.participante_1 === vencedorId}
                encerrada={encerrada}
              />
              <LinhaLado
                nome={p.nome_2}
                placar={p.placar_2}
                venceu={encerrada && vencedorId !== null && p.participante_2 === vencedorId}
                encerrada={encerrada}
              />
            </div>
          )
        })
      )}
    </div>
  )
}

/** Slot futuro (fase ainda não gerada). */
function ConfrontoFuturo() {
  return (
    <div className="text-muted-foreground flex w-56 flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-sm">
      <span>A definir</span>
      <span>A definir</span>
    </div>
  )
}

/**
 * Chave do mata-mata — RSC puro: uma coluna por fase (rótulo do motor),
 * confrontos agrupados por slot (pernas juntas), byes rotulados, fases
 * futuras como "a definir" e o campeão destacado quando a final encerra.
 * `overflow-x-auto` no container: chave de 16/32 não cabe no mobile.
 */
export function BracketView({
  partidas,
  terceiroLugar = false,
}: {
  partidas: PartidaDaChave[]
  /** Torneio com disputa de 3º lugar — a coluna final ganha o slot extra. */
  terceiroLugar?: boolean
}) {
  const s = tamanhoChaveDasPartidas(partidas)
  const fases = totalFases(s)
  // Rodada-base: nos formatos de grupos a chave começa após as rodadas de
  // grupos (rodadas contínuas) — a view trabalha com FASES relativas.
  const base = rodadaBaseDaChave(partidas)
  // O 3º lugar só existe se as DUAS semifinais têm perdedor real — com bye
  // na semi (chave de 4 com N=3) ele não é gerado. Mesma regra do motor.
  const temByeNaPrimeiraFase = partidas.some(
    (p) => p.rodada === base && (p.participante_1 === null || p.participante_2 === null)
  )
  const terceiroPrevisto = terceiroLugar && (s > 4 || !temByeNaPrimeiraFase)

  // Agrupa por FASE relativa → slot (pernas do mesmo confronto juntas).
  const porFase = new Map<number, Map<number, PartidaDaChave[]>>()
  for (const p of partidas) {
    const fase = p.rodada - base + 1
    const slots = porFase.get(fase) ?? new Map<number, PartidaDaChave[]>()
    const doSlot = slots.get(p.posicao) ?? []
    doSlot.push(p)
    slots.set(p.posicao, doSlot)
    porFase.set(fase, slots)
  }

  // Campeão: confronto regular (posicao 1) da rodada final decidido.
  const slotsFinal = porFase.get(fases)
  const confrontoFinal = slotsFinal?.get(1)
  const campeao =
    confrontoFinal !== undefined
      ? nomeDoVencedor({ posicao: 1, partidas: confrontoFinal, terceiroLugar: false })
      : null

  return (
    <div className="flex flex-col gap-4">
      {campeao !== null ? (
        <p className="flex items-center gap-2.5 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          <Trophy className="size-5 shrink-0 text-gold" aria-hidden="true" />
          <span className="font-display font-bold tracking-wide">{`Campeão: ${campeao}`}</span>
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-6">
          {Array.from({ length: fases }, (_, i) => i + 1).map((fase) => {
            const slots = porFase.get(fase)
            // A coluna final ganha 1 placeholder extra quando o 3º lugar virá.
            const confrontosEsperados =
              s / 2 ** fase + (fase === fases && terceiroPrevisto ? 1 : 0)
            return (
              <section
                key={fase}
                aria-label={rotuloFase(fase, fases)}
                className="flex flex-col gap-3"
              >
                <h3 className="font-display text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  {rotuloFase(fase, fases)}
                </h3>
                {/* justify-around aproxima o desenho de árvore sem cálculo
                    de conectores — confrontos da fase N alinham aos pares
                    da anterior. */}
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {slots
                    ? Array.from(slots.entries())
                        .sort(([a], [b]) => a - b)
                        .map(([posicao, doSlot]) => (
                          <ConfrontoCard
                            key={posicao}
                            confronto={{
                              posicao,
                              partidas: doSlot,
                              terceiroLugar: ehTerceiroLugar(fase, posicao, fases),
                            }}
                          />
                        ))
                    : Array.from({ length: confrontosEsperados }, (_, i) => (
                        <ConfrontoFuturo key={i} />
                      ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
