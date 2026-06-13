/**
 * Motor PURO de fluxo de temporada (sobe/cai, sorteio, conservação) — zero IO,
 * zero React, zero Supabase. Vive FORA de `src/actions/leaguePyramid.ts` porque
 * aquele módulo é `"use server"` (toda export precisa ser async function); estes
 * helpers são síncronos e os tipos são compartilhados por server actions, testes
 * e o client `FluxoTemporadaPanel`. Fonte única da lógica de fluxo.
 */
import {
  DIVISAO_MAX_TAMANHO,
  DIVISAO_MIN_TAMANHO,
} from "@/schema/leaguePyramidSchema"

/* -------------------------------------------------------------------------- */
/* Tipos do domínio de fluxo                                                   */
/* -------------------------------------------------------------------------- */

/** Destino de um competidor após o fluxo de uma temporada. */
export type Destino = "sobe" | "cai" | "permanece"

/** Como o destino foi decidido (motivo, NÃO um quarto destino). */
export type ResolvidoPor = "classificacao" | "playoff" | "sorteio" | "override"

/**
 * Uma linha já classificada de uma divisão, no formato mínimo que o cálculo de
 * fluxo precisa. Na Fase 1 (fronteiras `direto`) o corte é decidido SÓ pela
 * `posicao` DENTRO da divisão (empatados dividem a posição); `pontos`/`jogos`
 * são apenas o snapshot persistido nas entries (não entram no corte).
 */
export interface LinhaFluxo {
  competitorId: string
  posicao: number
  pontos: number
  jogos: number
}

/** Resultado por competidor no PLANO de fluxo (sem escrita). */
export interface ItemPlanoFluxo {
  competitorId: string
  /** Nível em que jogou nesta temporada (1 = topo). */
  nivelOrigem: number
  /** Nível para onde vai na próxima temporada. */
  nivelDestino: number
  posicaoFinal: number
  pontos: number
  jogos: number
  destino: Destino
  resolvidoPor: ResolvidoPor
  /**
   * Quando `resolvidoPor === 'sorteio'`, a PONTA do corte que o competidor
   * disputou ('sobe' = acesso; 'cai' = rebaixamento) — marcado tanto em quem
   * GANHOU a vaga quanto em quem a PERDEU. Identifica o grupo de empate na UI de
   * override (uma divisão do meio pode ter sorteio nos dois cortes). Ausente nos
   * itens decididos por classificação.
   */
  cortePonta?: "sobe" | "cai"
}

/** Fronteira entre a divisão `nivelSuperior` (d) e a de baixo (d+1). */
export interface FronteiraFluxo {
  nivelSuperior: number
  vagasAcesso: number
  vagasRebaixamento: number
}

/** Uma divisão pronta para o cálculo: nível + suas linhas classificadas. */
export interface DivisaoFluxo {
  nivel: number
  /** Já ordenadas por posição ascendente (1º primeiro). */
  linhas: LinhaFluxo[]
}

/** PLANO completo (read-only) de um fluxo de temporada. */
export interface PlanoFluxoTemporada {
  /** Itens por competidor (todos os de todas as divisões). */
  itens: ItemPlanoFluxo[]
  /** Semente do sorteio = id da temporada (estável/auditável/reproduzível). */
  seed: string
}

/** Ajuste manual do dono sobre o plano sorteado (override do empate). */
export interface AjusteFluxo {
  competitorId: string
  destino: Destino
  nivelDestino: number
}

/* -------------------------------------------------------------------------- */
/* Sorteio determinístico                                                      */
/* -------------------------------------------------------------------------- */

/**
 * PRNG determinístico semeado por uma string (mulberry32 sobre um hash FNV-1a
 * da semente). Mesma semente ⇒ mesma sequência ⇒ mesma ordem sorteada. Crypto
 * NÃO serve aqui (não é reproduzível): a semente do fluxo é o ID da temporada
 * (estável e já persistido/auditável), então o sorteio é sempre reexecutável e
 * a confirmação idempotente — calcular e confirmar produzem o MESMO resultado.
 */
export function prngDeSemente(seed: string): () => number {
  // FNV-1a 32 bits da semente → estado inicial do mulberry32.
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let estado = h >>> 0
  return function () {
    estado |= 0
    estado = (estado + 0x6d2b79f5) | 0
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Embaralha (Fisher-Yates) uma cópia de `itens` com um PRNG determinístico
 * semeado por `seed`. Mesma semente + mesma entrada ⇒ mesma saída.
 */
export function ordemSorteada<T>(itens: readonly T[], seed: string): T[] {
  const arr = [...itens]
  const rng = prngDeSemente(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* -------------------------------------------------------------------------- */
/* Zona de corte (sobe/cai com empate por sorteio)                             */
/* -------------------------------------------------------------------------- */

/**
 * Resolve QUAIS linhas ocupam as `vagas` da ponta indicada (`top` = primeiras
 * posições = quem SOBE; `bottom` = últimas = quem CAI), tratando o empate EXATO
 * na zona de corte por sorteio determinístico.
 *
 * Retorna os `competitorId` escolhidos + o conjunto dos que foram decididos por
 * sorteio (corte caiu no meio de um grupo de empatados pela `posicao`).
 *
 * `linhas` deve vir ordenada por posição ascendente. `seedBase` semeia o PRNG
 * (combinado com o nível+ponta para sorteios independentes por fronteira).
 */
export function resolverZonaDeCorte(
  linhas: readonly LinhaFluxo[],
  vagas: number,
  ponta: "top" | "bottom",
  seedBase: string
): { escolhidos: Set<string>; sorteados: Set<string> } {
  const escolhidos = new Set<string>()
  const sorteados = new Set<string>()
  if (vagas <= 0 || linhas.length === 0) return { escolhidos, sorteados }
  if (vagas >= linhas.length) {
    // A zona engole a divisão inteira — todos entram, nada a sortear.
    for (const l of linhas) escolhidos.add(l.competitorId)
    return { escolhidos, sorteados }
  }

  // Ordena pela "distância da ponta": top usa posição ascendente; bottom usa a
  // posição DESCENDENTE (os últimos primeiro). O sorteio só age no grupo que
  // CRUZA a linha de corte.
  const ordenadas =
    ponta === "top"
      ? [...linhas].sort((a, b) => a.posicao - b.posicao)
      : [...linhas].sort((a, b) => b.posicao - a.posicao)

  // Os que estão claramente DENTRO (antes do grupo de corte) e o grupo de corte.
  const dentro: LinhaFluxo[] = []
  for (let i = 0; i < vagas; i++) dentro.push(ordenadas[i])

  // Posição na fronteira (a do último que entra direto). Todos os empatados nessa
  // posição (de ambos os lados do corte) disputam as vagas restantes por sorteio.
  const posCorte = ordenadas[vagas - 1].posicao
  const grupoCorte = ordenadas.filter((l) => l.posicao === posCorte)

  if (grupoCorte.length <= 1) {
    // Sem empate na linha de corte: os `vagas` primeiros entram, sem sorteio.
    for (const l of dentro) escolhidos.add(l.competitorId)
    return { escolhidos, sorteados }
  }

  // Empate na zona de corte: os que estão ANTES do grupo entram direto; o grupo
  // de empatados é sorteado para preencher as vagas restantes.
  const antesDoGrupo = ordenadas
    .slice(0, vagas)
    .filter((l) => l.posicao !== posCorte)
  for (const l of antesDoGrupo) escolhidos.add(l.competitorId)

  const vagasRestantes = vagas - antesDoGrupo.length
  // Só há SORTEIO real quando o grupo de empatados NÃO cabe inteiro nas vagas
  // restantes (alguém empatado fica de fora). Se cabe (vagasRestantes ===
  // grupoCorte.length), todos entram por classificação — marcar 'sorteio' aí
  // mentiria no histórico (resolvido_por) e na UI (badge/affordance de empate).
  const haDisputa = vagasRestantes < grupoCorte.length
  // Semente independente por fronteira+ponta (sorteios não se contaminam).
  const seed = `${seedBase}:${ponta}:${posCorte}`
  const ordem = haDisputa ? ordemSorteada(grupoCorte, seed) : grupoCorte
  for (let i = 0; i < vagasRestantes; i++) {
    escolhidos.add(ordem[i].competitorId)
  }
  // TODOS os empatados na linha de corte foram DECIDIDOS pelo sorteio — quem
  // levou a vaga E quem a perdeu. Marcar o grupo inteiro (não só os vencedores)
  // é o que permite ao dono transferir a vaga na UI de override; reordenar entre
  // só-vencedores não mudaria nada. Sem disputa, ninguém é sorteado.
  if (haDisputa) {
    for (const m of grupoCorte) sorteados.add(m.competitorId)
  }
  return { escolhidos, sorteados }
}

/* -------------------------------------------------------------------------- */
/* Plano de fluxo + conservação de tamanho                                     */
/* -------------------------------------------------------------------------- */

/**
 * Calcula o PLANO de fluxo (read-only) a partir das divisões classificadas e
 * das fronteiras `direto`. Para cada fronteira d↔d+1:
 *   - os `vagasRebaixamento` ÚLTIMOS da divisão d CAEM;
 *   - os `vagasAcesso` PRIMEIROS da divisão d+1 SOBEM.
 * Empate exato na linha de corte → sorteio determinístico (`seed`). Função PURA
 * (sem banco) — o coração testável de `calcularFluxoTemporada`.
 */
export function calcularPlanoFluxo(
  divisoes: readonly DivisaoFluxo[],
  fronteiras: readonly FronteiraFluxo[],
  seed: string
): PlanoFluxoTemporada {
  const porNivel = new Map<number, DivisaoFluxo>()
  for (const d of divisoes) porNivel.set(d.nivel, d)

  // Conjuntos de quem sobe/cai por nível. Os PARTICIPANTES do sorteio são
  // rastreados POR PONTA (sorteadosSobe/sorteadosCai) — uma divisão do meio pode
  // ter empate sorteado no acesso E no rebaixamento, e a UI de override precisa
  // saber a qual corte cada empatado (vencedor ou perdedor) pertence.
  const sobeDe = new Map<number, Set<string>>()
  const caiDe = new Map<number, Set<string>>()
  const sorteadosSobe = new Map<number, Set<string>>()
  const sorteadosCai = new Map<number, Set<string>>()

  // (1) REBAIXAMENTOS primeiro: para cada fronteira, os ÚLTIMOS da superior caem.
  for (const f of fronteiras) {
    const sup = porNivel.get(f.nivelSuperior)
    if (!sup) continue
    const queda = resolverZonaDeCorte(
      sup.linhas,
      f.vagasRebaixamento,
      "bottom",
      `${seed}:cai:${f.nivelSuperior}`
    )
    caiDe.set(sup.nivel, queda.escolhidos)
    sorteadosCai.set(sup.nivel, queda.sorteados)
  }

  // (2) ACESSOS depois: os PRIMEIROS da inferior sobem, EXCLUINDO quem já caiu.
  // Uma divisão do meio é `sup` de uma fronteira (cai) E `inf` de outra (sobe);
  // num empate que cobre os dois cortes, sem excluir os já-rebaixados o MESMO
  // competidor poderia ser escolhido para subir E cair — fisicamente impossível
  // e corromperia a conservação (a vaga de acesso some no else-if abaixo).
  for (const f of fronteiras) {
    const inf = porNivel.get(f.nivelSuperior + 1)
    if (!inf) continue
    const jaCaiu = caiDe.get(inf.nivel) ?? new Set<string>()
    const elegiveis = inf.linhas.filter((l) => !jaCaiu.has(l.competitorId))
    const acesso = resolverZonaDeCorte(
      elegiveis,
      f.vagasAcesso,
      "top",
      `${seed}:sobe:${f.nivelSuperior}`
    )
    sobeDe.set(inf.nivel, acesso.escolhidos)
    sorteadosSobe.set(inf.nivel, acesso.sorteados)
  }

  const itens: ItemPlanoFluxo[] = []
  for (const div of divisoes) {
    const sobe = sobeDe.get(div.nivel) ?? new Set<string>()
    const cai = caiDe.get(div.nivel) ?? new Set<string>()
    const sSobe = sorteadosSobe.get(div.nivel) ?? new Set<string>()
    const sCai = sorteadosCai.get(div.nivel) ?? new Set<string>()
    for (const linha of div.linhas) {
      let destino: Destino = "permanece"
      let nivelDestino = div.nivel
      if (cai.has(linha.competitorId)) {
        destino = "cai"
        nivelDestino = div.nivel + 1
      } else if (sobe.has(linha.competitorId)) {
        destino = "sobe"
        nivelDestino = div.nivel - 1
      }
      // Corte de sorteio segue o DESTINO realizado: quem subiu pertence ao corte
      // de acesso, quem caiu ao de rebaixamento — senão a UI agruparia o vencedor
      // no corte errado e emitiria um "Ajuste fantasma" (dead-end no confirm). Só
      // o 'permanece'-sorteado (disputou e ficou) usa os conjuntos; no straddle a
      // prioridade cai>sobe é arbitrária mas determinística e NÃO rouba o grupo de
      // quem ganhou a vaga (já fixado pelo destino).
      let cortePonta: "sobe" | "cai" | undefined
      if (destino === "sobe") {
        cortePonta = "sobe"
      } else if (destino === "cai") {
        cortePonta = "cai"
      } else if (sCai.has(linha.competitorId)) {
        cortePonta = "cai"
      } else if (sSobe.has(linha.competitorId)) {
        cortePonta = "sobe"
      }
      itens.push({
        competitorId: linha.competitorId,
        nivelOrigem: div.nivel,
        nivelDestino,
        posicaoFinal: linha.posicao,
        pontos: linha.pontos,
        jogos: linha.jogos,
        destino,
        resolvidoPor: cortePonta ? "sorteio" : "classificacao",
        ...(cortePonta ? { cortePonta } : {}),
      })
    }
  }

  return { itens, seed }
}

/**
 * Valida a CONSERVAÇÃO de tamanho ao montar a próxima temporada a partir do
 * plano: para cada divisão, o tamanho resultante = entrantes (permanece +
 * recebidos de cima + recebidos de baixo). REJEITA (retorna o nível ofensor) se
 * alguma divisão sair de [2,20]. Função PURA — espelha o CHECK de fechamento do
 * banco (design §7.1) e roda ANTES de qualquer escrita.
 */
export function validarFechamentoTamanho(itens: readonly ItemPlanoFluxo[]):
  | {
      ok: true
      tamanhos: Map<number, number>
    }
  | {
      ok: false
      nivel: number
      tamanho: number
    } {
  const tamanhos = new Map<number, number>()
  for (const it of itens) {
    tamanhos.set(it.nivelDestino, (tamanhos.get(it.nivelDestino) ?? 0) + 1)
  }
  for (const [nivel, tamanho] of [...tamanhos.entries()].sort((a, b) => a[0] - b[0])) {
    if (tamanho < DIVISAO_MIN_TAMANHO || tamanho > DIVISAO_MAX_TAMANHO) {
      return { ok: false, nivel, tamanho }
    }
  }
  return { ok: true, tamanhos }
}
