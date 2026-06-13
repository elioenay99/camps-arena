import { z } from "zod"

import { MATA_MATA_MAX_PARTICIPANTES } from "@/features/knockout/gerarChaveMataMata"
import { LIGA_MAX_PARTICIPANTES } from "@/features/league/gerarTabelaLiga"

import { NOME_MAX } from "@/schema/tournamentSchema"

/**
 * Schema de criação de uma PIRÂMIDE de ligas (change add-ligas-piramide, Fase 1).
 *
 * Uma pirâmide ("league_competitions") é imortal e tem N divisões empilhadas
 * (nível 1 = topo). Entre divisões adjacentes existem FRONTEIRAS de sobe/cai.
 * Cada divisão É um torneio de liga (reúso total do motor); este schema valida
 * apenas a CONFIGURAÇÃO inicial — a montagem dos torneios/slots roda server-side
 * (RPC `montar_temporada`, ver design §3.3).
 *
 * Os refines aqui REJEITAM (não apenas avisam): uma config inconsistente
 * nasceria travada (divisão fora de [2,20], fronteira entre níveis inexistentes,
 * conservação de tamanho que estoura). Espelha as CHECKs do banco e a invariante
 * de conservação de tamanho do design (§7.1).
 */

/** Tamanho mínimo/máximo de uma divisão — espelha o motor de liga e a CHECK do banco. */
export const DIVISAO_MIN_TAMANHO = 2
export const DIVISAO_MAX_TAMANHO = LIGA_MAX_PARTICIPANTES // 20

/** Nº máximo de divisões numa pirâmide (teto sano de UI; ajustável por fase). */
export const MAX_DIVISOES = 8

/**
 * Presets de desempate disponíveis na Fase 0/1. `custom`/`espanhol` entram na
 * Fase 5 (mini-tabela entre 3+ empatados) — fora do enum aqui de propósito.
 */
export const DESEMPATES_DISPONIVEIS = ["cbf", "ingles"] as const

/** Modos de fronteira disponíveis até a Fase 2 (barragem_cruzada é Fase 3). */
export const MODOS_FRONTEIRA = ["direto", "playoff_acesso", "playout"] as const

/** Estilos de resolução de uma fronteira de playoff (Fase 2). */
export const PLAYOFF_ESTILOS = ["vagas", "extra"] as const

/**
 * Tamanhos de chave COMPLETA (sem byes) exigidos pelo estilo `vagas`: a chave
 * para numa rodada exata e o nº de vencedores é potência de 2. O estilo `extra`
 * aceita qualquer 2..32 (byes ok).
 */
export const PLAYOFF_VAGAS_COMPLETAS = [4, 8, 16, 32] as const

/** Identificador de preset de pirâmide (atalhos de UI). */
export const PRESET_PERSONALIZADO = "personalizado" as const

/** true se `n` é uma potência de 2 positiva (1,2,4,8…). */
export function ehPotenciaDe2(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

/** Forma mínima de fronteira que o movimento efetivo precisa. */
export type FronteiraMovimento = {
  modo: (typeof MODOS_FRONTEIRA)[number]
  playoffEstilo?: (typeof PLAYOFF_ESTILOS)[number]
  vagasAcesso: number
  vagasRebaixamento: number
}

/**
 * Movimento EFETIVO de uma fronteira (quantos REALMENTE sobem/caem). O `+1` do
 * estilo `extra` entra SÓ no lado da CHAVE (design §8.3): `playoff_acesso extra`
 * promove `vagasAcesso+1` (diretos + campeão) e rebaixa `vagasRebaixamento`
 * diretos; `playout extra` rebaixa `vagasRebaixamento+1` (diretos + perdedor da
 * final) e promove `vagasAcesso` diretos. `vagas`/`direto` ⇒ efetivos = brutos.
 * FONTE ÚNICA consumida por schema (conservação) + wizard (lockstep) + actions.
 */
export function movimentoEfetivo(f: FronteiraMovimento): {
  sobeEf: number
  caiEf: number
} {
  if (f.modo === "playoff_acesso" && f.playoffEstilo === "extra") {
    return { sobeEf: f.vagasAcesso + 1, caiEf: f.vagasRebaixamento }
  }
  if (f.modo === "playout" && f.playoffEstilo === "extra") {
    return { sobeEf: f.vagasAcesso, caiEf: f.vagasRebaixamento + 1 }
  }
  return { sobeEf: f.vagasAcesso, caiEf: f.vagasRebaixamento }
}

/**
 * Tamanho da ZONA da chave (quantos competidores entram no playoff), tirada da
 * divisão-fonte (inferior no acesso; superior no playout). No `vagas` é a chave
 * inteira (`playoffVagas`); no `extra` são os `playoffVagas` que disputam a vaga
 * extra ALÉM dos diretos (que também ocupam posições da divisão).
 */
export function zonaDaChave(f: {
  modo: (typeof MODOS_FRONTEIRA)[number]
  playoffEstilo?: (typeof PLAYOFF_ESTILOS)[number]
  vagasAcesso: number
  vagasRebaixamento: number
  playoffVagas: number
}): number {
  if (f.playoffEstilo === "vagas") return f.playoffVagas
  // extra: diretos (do lado da chave) + os que disputam a chave.
  const diretos = f.modo === "playoff_acesso" ? f.vagasAcesso : f.vagasRebaixamento
  return diretos + f.playoffVagas
}

/**
 * Competidor no modo CLUBE: id do cache `teams` + nome/escudo já resolvidos
 * (o form passa via hidden fields tipados). Espelha `league_competitors` (modo
 * clube). Na Fase 1 a vaga é SEMPRE gerida pelo dono (`holder_user_id = null`):
 * delegar a vaga a um técnico de TERCEIRO exige consentimento e virá por um
 * fluxo de convite/aceite (espelhando `aceitar_convite_vaga`), não pré-atribuído
 * aqui — anexar um usuário sem aceite vazaria as partidas de divisão privada.
 */
const competidorClube = z.object({
  teamId: z.uuid({ error: "Clube inválido." }),
  nome: z.string().trim().min(1, "Nome do clube vazio."),
  escudo: z.string().trim().min(1).optional(),
})

/**
 * Competidor no modo POR NOME: rótulo livre persistente. Espelha
 * `league_competitors` (modo rótulo). Vaga sempre gerida pelo dono na Fase 1
 * (ver nota de `competidorClube` sobre delegação por aceite).
 */
const competidorNome = z.object({
  rotulo: z
    .string()
    .trim()
    .min(1, "Nome vazio.")
    .max(NOME_MAX, `Nome muito longo (máx. ${NOME_MAX}).`),
})

/**
 * Uma divisão da pirâmide. `porNome` decide o modo (clube vs. rótulo); a
 * coerência entre `porNome` e a lista de competidores é validada no
 * `superRefine` do schema-mãe (Zod não cruza campos dentro do objeto da
 * divisão sem refine, e queremos um path preciso por divisão).
 */
const divisaoSchema = z.object({
  nivel: z
    .number({ error: "Nível inválido." })
    .int("O nível deve ser inteiro.")
    .min(1, "O nível começa em 1."),
  nome: z.string().trim().min(1, "Informe o nome da divisão.").max(60, "Nome muito longo."),
  porNome: z.boolean().default(false),
  desempate: z.enum(DESEMPATES_DISPONIVEIS, {
    error: "Critério de desempate inválido.",
  }),
  tamanho: z
    .number({ error: "Tamanho inválido." })
    .int("O tamanho deve ser inteiro.")
    .min(DIVISAO_MIN_TAMANHO, `A divisão precisa de ao menos ${DIVISAO_MIN_TAMANHO} competidores.`)
    .max(DIVISAO_MAX_TAMANHO, `A divisão aceita no máximo ${DIVISAO_MAX_TAMANHO} competidores.`),
  competidores: z
    .array(z.union([competidorClube, competidorNome]))
    .default([]),
})

export type DivisaoInput = z.infer<typeof divisaoSchema>

/**
 * Uma fronteira entre a divisão de nível `nivelSuperior` (d) e a de baixo
 * (d+1). `vagasAcesso` = quantos SOBEM da inferior; `vagasRebaixamento` =
 * quantos CAEM da superior. Fase 1 só entrega `modo: 'direto'`.
 *
 * SIMETRIA obrigatória na Fase 1: sobem e caem o MESMO número por fronteira.
 * No modo 'direto' a assimetria faria o tamanho das divisões oscilar a cada
 * temporada (a de cima recebe X de baixo e perde Y; se X≠Y ela cresce/encolhe),
 * até estourar [2,20] e travar a pirâmide imortal sem recuperação. Acesso
 * assimétrico real exige playoff/barragem (Fases 2-3).
 */
const fronteiraSchema = z
  .object({
    nivelSuperior: z
      .number({ error: "Nível da fronteira inválido." })
      .int("O nível deve ser inteiro.")
      .min(1, "O nível da fronteira começa em 1."),
    vagasAcesso: z
      .number({ error: "Vagas de acesso inválidas." })
      .int("As vagas devem ser inteiras.")
      .min(0, "As vagas de acesso não podem ser negativas."),
    vagasRebaixamento: z
      .number({ error: "Vagas de rebaixamento inválidas." })
      .int("As vagas devem ser inteiras.")
      .min(0, "As vagas de rebaixamento não podem ser negativas."),
    // Fase 2: 'direto' (extremos da tabela), 'playoff_acesso' (chave decide o
    // acesso) e 'playout' (chave decide a queda). 'barragem_cruzada' = Fase 3.
    modo: z.enum(MODOS_FRONTEIRA, { error: "Modo de fronteira inválido." }),
    // Estilo do playoff (Fase 2): 'vagas' = chave decide as vagas; 'extra' =
    // diretos + 1 na chave. Obrigatório sse modo ≠ 'direto'.
    playoffEstilo: z.enum(PLAYOFF_ESTILOS).optional(),
    // Leg format da chave (jogo único vs ida-e-volta; final sempre jogo único).
    playoffIdaEVolta: z.boolean().default(false),
    // Quantos competidores entram na chave (2..32). Obrigatório sse modo ≠ 'direto'.
    playoffVagas: z
      .number({ error: "Tamanho da chave inválido." })
      .int("O tamanho da chave deve ser inteiro.")
      .min(2, "A chave precisa de ao menos 2 participantes.")
      .max(
        MATA_MATA_MAX_PARTICIPANTES,
        `A chave aceita no máximo ${MATA_MATA_MAX_PARTICIPANTES} participantes.`
      )
      .optional(),
  })
  // Coerência POR FRONTEIRA (a conservação/zona-cabe, que dependem do tamanho da
  // divisão, ficam no superRefine do schema-mãe). A simetria por fronteira (sobre
  // os EFETIVOS) também é validada lá (precisa de movimentoEfetivo cruzado).
  .superRefine((f, ctx) => {
    if (f.modo === "direto") {
      if (f.playoffEstilo !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Uma fronteira direta não tem estilo de playoff.",
          path: ["playoffEstilo"],
        })
      }
      return
    }

    // modo playoff_acesso | playout
    if (f.playoffEstilo === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Escolha o estilo do playoff: a chave decide as vagas, ou direto + 1 na chave.",
        path: ["playoffEstilo"],
      })
      return
    }
    if (f.playoffVagas === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Informe quantos competidores entram na chave.",
        path: ["playoffVagas"],
      })
      return
    }
    const pv = f.playoffVagas

    if (f.playoffEstilo === "vagas") {
      if (!(PLAYOFF_VAGAS_COMPLETAS as readonly number[]).includes(pv)) {
        ctx.addIssue({
          code: "custom",
          message: `O estilo "a chave decide as vagas" exige uma chave completa (${PLAYOFF_VAGAS_COMPLETAS.join(", ")}). Para outros tamanhos, use "direto + 1 na chave".`,
          path: ["playoffVagas"],
        })
        return
      }
      if (f.modo === "playoff_acesso") {
        // Os `vagasAcesso` SOBREVIVENTES sobem ⇒ potência de 2 < pv.
        if (!ehPotenciaDe2(f.vagasAcesso) || f.vagasAcesso >= pv) {
          ctx.addIssue({
            code: "custom",
            message: `Numa chave de ${pv} que decide as vagas, o nº que sobe deve ser potência de 2 e menor que ${pv} (a chave para na rodada que deixa esse nº de vencedores). Use ${PLAYOFF_VAGAS_COMPLETAS.filter((x) => x < pv).join("/")} ou "direto + 1 na chave".`,
            path: ["vagasAcesso"],
          })
        }
      } else {
        // playout: os ELIMINADOS caem ⇒ sobreviventes = pv - vagasRebaixamento
        // deve ser potência de 2 (a chave para deixando os salvos).
        const sobreviventes = pv - f.vagasRebaixamento
        if (!ehPotenciaDe2(sobreviventes) || sobreviventes >= pv) {
          ctx.addIssue({
            code: "custom",
            message: `Num playout de ${pv} que decide as vagas, devem sobrar (salvar) uma potência de 2 — caem ${f.vagasRebaixamento} ⇒ sobram ${sobreviventes}. Ajuste para sobrar 2, 4, 8… ou use "direto + 1 na chave".`,
            path: ["vagasRebaixamento"],
          })
        }
      }
    }
    // estilo 'extra': pv ∈ [2,32] já garantido pelos .min/.max do campo.
  })

export type FronteiraInput = z.infer<typeof fronteiraSchema>

/** Discrimina se um competidor está no modo nome (tem `rotulo`) ou clube. */
function ehCompetidorNome(
  c: DivisaoInput["competidores"][number]
): c is z.infer<typeof competidorNome> {
  return "rotulo" in c
}

/**
 * Criação de uma pirâmide de ligas. Validação estrutural completa via
 * `superRefine` — todas as invariantes do design (§7) são REJEIÇÕES, não avisos.
 */
export const createCompetitionSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, "Informe um nome com ao menos 2 caracteres.")
      .max(80, "Nome muito longo."),
    isPublic: z.boolean().default(true),
    divisoes: z
      .array(divisaoSchema)
      .min(1, "A pirâmide precisa de ao menos uma divisão.")
      .max(MAX_DIVISOES, `A pirâmide aceita no máximo ${MAX_DIVISOES} divisões.`),
    fronteiras: z.array(fronteiraSchema).default([]),
  })
  .superRefine((d, ctx) => {
    const divisoes = d.divisoes
    const n = divisoes.length

    // (1) Níveis contínuos 1..N — sem buracos nem duplicatas. Ordenamos por
    // nível para validar a sequência e usamos o índice ORDENADO ao apontar
    // erros nas divisões individuais.
    const niveisOrdenados = [...divisoes]
      .map((div, idx) => ({ div, idx }))
      .sort((a, b) => a.div.nivel - b.div.nivel)
    const niveisVistos = new Set<number>()
    let niveisContinuos = true
    for (let i = 0; i < niveisOrdenados.length; i++) {
      const nivel = niveisOrdenados[i].div.nivel
      if (niveisVistos.has(nivel)) {
        niveisContinuos = false
        ctx.addIssue({
          code: "custom",
          message: `Nível ${nivel} repetido. Cada divisão tem um nível único de 1 a ${n}.`,
          path: ["divisoes", niveisOrdenados[i].idx, "nivel"],
        })
        continue
      }
      niveisVistos.add(nivel)
      if (nivel !== i + 1) {
        niveisContinuos = false
        ctx.addIssue({
          code: "custom",
          message: `Os níveis devem ser contínuos de 1 a ${n} (sem buracos). Esperado ${i + 1}, recebido ${nivel}.`,
          path: ["divisoes", niveisOrdenados[i].idx, "nivel"],
        })
      }
    }

    // Mapa nível → divisão (só confiável se os níveis forem contínuos).
    const porNivel = new Map<number, DivisaoInput>()
    for (const div of divisoes) {
      if (!porNivel.has(div.nivel)) porNivel.set(div.nivel, div)
    }

    // (2) Cada divisão tem EXATAMENTE `tamanho` competidores, todos do modo
    // certo (porNome → rótulos; senão → clubes).
    divisoes.forEach((div, idx) => {
      if (div.competidores.length !== div.tamanho) {
        ctx.addIssue({
          code: "custom",
          message: `A divisão "${div.nome}" precisa de exatamente ${div.tamanho} competidores (tem ${div.competidores.length}).`,
          path: ["divisoes", idx, "competidores"],
        })
      }
      div.competidores.forEach((c, cIdx) => {
        const ehNome = ehCompetidorNome(c)
        if (div.porNome && !ehNome) {
          ctx.addIssue({
            code: "custom",
            message: `A divisão "${div.nome}" é por nome: informe um rótulo, não um clube.`,
            path: ["divisoes", idx, "competidores", cIdx],
          })
        } else if (!div.porNome && ehNome) {
          ctx.addIssue({
            code: "custom",
            message: `A divisão "${div.nome}" é por clube: selecione um clube, não um nome livre.`,
            path: ["divisoes", idx, "competidores", cIdx],
          })
        }
      })

      // Unicidade dentro da divisão (rótulos case-insensitive; clubes por id).
      // Espelha os índices únicos parciais de `league_competitors`.
      if (div.porNome) {
        const rotulos = div.competidores
          .filter(ehCompetidorNome)
          .map((c) => c.rotulo.trim().toLowerCase())
        if (new Set(rotulos).size !== rotulos.length) {
          ctx.addIssue({
            code: "custom",
            message: `Há nomes repetidos na divisão "${div.nome}".`,
            path: ["divisoes", idx, "competidores"],
          })
        }
      } else {
        const ids = div.competidores
          .filter((c): c is z.infer<typeof competidorClube> => !ehCompetidorNome(c))
          .map((c) => c.teamId)
        if (new Set(ids).size !== ids.length) {
          ctx.addIssue({
            code: "custom",
            message: `Há clubes repetidos na divisão "${div.nome}".`,
            path: ["divisoes", idx, "competidores"],
          })
        }
      }
    })

    // (3) Fronteiras: só entre níveis ADJACENTES existentes; no máximo uma por
    // par. Acumula sobe/cai por nível para a conservação (passo 4).
    const recebeDeCima = new Map<number, number>() // nível d recebe X de d-1 (acesso de d-1↔d)
    const recebeDeBaixo = new Map<number, number>() // nível d recebe Y de d+1
    const sobe = new Map<number, number>() // quantos sobem de d (para d-1)
    const cai = new Map<number, number>() // quantos caem de d (para d+1)
    const paresVistos = new Set<number>()

    d.fronteiras.forEach((f, idx) => {
      const sup = f.nivelSuperior
      const inf = sup + 1

      // Adjacência: ambos os níveis precisam existir e a pirâmide é contínua.
      const supExiste = niveisContinuos ? sup >= 1 && sup <= n : porNivel.has(sup)
      const infExiste = niveisContinuos ? inf >= 1 && inf <= n : porNivel.has(inf)
      if (!supExiste || !infExiste) {
        ctx.addIssue({
          code: "custom",
          message: `Fronteira inválida: não há divisões adjacentes nos níveis ${sup} e ${inf}.`,
          path: ["fronteiras", idx, "nivelSuperior"],
        })
        return
      }

      if (paresVistos.has(sup)) {
        ctx.addIssue({
          code: "custom",
          message: `Já existe uma fronteira entre os níveis ${sup} e ${inf}.`,
          path: ["fronteiras", idx, "nivelSuperior"],
        })
        return
      }
      paresVistos.add(sup)

      // Movimento EFETIVO (o +1 do estilo 'extra' é de UM lado só — §8.3).
      const { sobeEf, caiEf } = movimentoEfetivo(f)

      // SIMETRIA sobre os EFETIVOS: sobeEf == caiEf mantém o tamanho de CADA
      // divisão estável a cada temporada (pirâmide imortal). Em 'extra' isso
      // EXIGE a assimetria bruta (playoff_acesso: rebaix = acesso+1; playout:
      // acesso = rebaix+1). Sem isto a divisão oscila até estourar [2,20].
      if (sobeEf !== caiEf) {
        const dica =
          f.modo === "playoff_acesso" && f.playoffEstilo === "extra"
            ? ` (no acesso "direto + 1", configure ${sobeEf} rebaixamentos diretos da divisão de cima).`
            : f.modo === "playout" && f.playoffEstilo === "extra"
              ? ` (no playout "direto + 1", configure ${caiEf} acessos diretos da divisão de baixo).`
              : " (devem subir e cair o mesmo número, mantendo o tamanho das divisões estável)."
        ctx.addIssue({
          code: "custom",
          message: `Esta fronteira promoveria ${sobeEf} e rebaixaria ${caiEf} — precisa ser igual${dica}`,
          path: ["fronteiras", idx, "vagasAcesso"],
        })
      }

      // ZONA da chave cabe na divisão-FONTE (acesso ⇒ inferior; playout ⇒
      // superior). É invariante distinta do movimento físico/fechamento.
      if (f.modo !== "direto" && f.playoffEstilo && f.playoffVagas) {
        const fonteNivel = f.modo === "playout" ? sup : inf
        const fonte = porNivel.get(fonteNivel)
        if (fonte) {
          const zona = zonaDaChave({ ...f, playoffVagas: f.playoffVagas })
          if (zona > fonte.tamanho) {
            ctx.addIssue({
              code: "custom",
              message: `A chave de playoff precisa de ${zona} competidores da divisão "${fonte.nome}", que só tem ${fonte.tamanho}. Reduza o tamanho da chave ou as vagas diretas.`,
              path: ["fronteiras", idx, "playoffVagas"],
            })
          }
        }
      }

      // CAEM da superior (d=sup) e descem para inf; SOBEM da inferior (d=inf)
      // e sobem para sup. Acumula os EFETIVOS (conservação real, §8.3).
      cai.set(sup, (cai.get(sup) ?? 0) + caiEf)
      recebeDeCima.set(inf, (recebeDeCima.get(inf) ?? 0) + caiEf)
      sobe.set(inf, (sobe.get(inf) ?? 0) + sobeEf)
      recebeDeBaixo.set(sup, (recebeDeBaixo.get(sup) ?? 0) + sobeEf)
    })

    // Sem fronteiras contínuas confiáveis, não dá para fechar a conservação —
    // já reportamos os buracos/duplicatas; a conservação roda quando a base é sã.
    if (!niveisContinuos) return

    // (4) PONTAS: divisão 1 (topo) nunca recebe de cima nem tem acesso para
    // cima; última (nível N) nunca recebe de baixo nem rebaixa para baixo. Como
    // só permitimos fronteiras entre níveis 1..N existentes, sobe(1) e cai(N)
    // já são naturalmente 0 (não há fronteira com nível 0 nem N+1). A garantia
    // explícita abaixo é o FECHAMENTO da conservação por divisão.

    // (5) INVARIANTE de conservação de tamanho: para cada divisão d,
    //   tamanho_pos = tamanho_d - sobe_d - cai_d + recebidos_de_cima + recebidos_de_baixo
    // DEVE permanecer em [2,20]. Rejeita config que viole em QUALQUER divisão
    // (multi-fronteira inclusive). Espelha o CHECK de fechamento (design §7.1).
    for (let nivel = 1; nivel <= n; nivel++) {
      const div = porNivel.get(nivel)
      if (!div) continue
      const idx = divisoes.indexOf(div)

      // (5a) MOVIMENTO FÍSICO: a divisão não pode promover E rebaixar mais
      // competidores do que ela contém. Sem isto, o fechamento `pos` pode até
      // cair em [2,20] (ex.: tamanho 2 com 2 sobem + 2 caem + 2/2 recebidos = 2),
      // mas o plano de fluxo seria lixo (os 2 marcados sobem E caem; o motor
      // resolve para 'cai' e descarta o 'sobe' silenciosamente).
      const saem = (sobe.get(nivel) ?? 0) + (cai.get(nivel) ?? 0)
      if (saem > div.tamanho) {
        ctx.addIssue({
          code: "custom",
          message: `A divisão "${div.nome}" não pode promover e rebaixar ${saem} competidores: ela só tem ${div.tamanho}. Reduza as vagas das fronteiras vizinhas.`,
          path: ["divisoes", idx, "tamanho"],
        })
        continue
      }

      // (5b) FECHAMENTO de tamanho em [2,20].
      const pos =
        div.tamanho -
        (sobe.get(nivel) ?? 0) -
        (cai.get(nivel) ?? 0) +
        (recebeDeCima.get(nivel) ?? 0) +
        (recebeDeBaixo.get(nivel) ?? 0)

      if (pos < DIVISAO_MIN_TAMANHO) {
        ctx.addIssue({
          code: "custom",
          message: `A divisão "${div.nome}" terminaria com ${pos} competidores após o sobe/cai — o mínimo é ${DIVISAO_MIN_TAMANHO}. Ajuste os tamanhos ou as vagas das fronteiras.`,
          path: ["divisoes", idx, "tamanho"],
        })
      } else if (pos > DIVISAO_MAX_TAMANHO) {
        ctx.addIssue({
          code: "custom",
          message: `A divisão "${div.nome}" terminaria com ${pos} competidores após o sobe/cai — o máximo é ${DIVISAO_MAX_TAMANHO}. Ajuste os tamanhos ou as vagas das fronteiras.`,
          path: ["divisoes", idx, "tamanho"],
        })
      }
    }
  })

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>

/**
 * Presets de pirâmide (atalhos de UI). Carregam apenas o "esqueleto" sobe/cai
 * e o desempate típico de cada formato; o dono completa as divisões/competidores
 * no wizard. Mantemos como dados (não objetos validados) — a UI hidrata e o
 * `createCompetitionSchema` valida a config final montada.
 */
export type PiramidePreset = {
  /** Vagas que SOBEM/CAEM em cada fronteira interna (simétrico por padrão). */
  vagasPorFronteira: number
  /** Desempate sugerido para todas as divisões. */
  desempate: (typeof DESEMPATES_DISPONIVEIS)[number]
  /** Rótulo amigável do preset (UI). */
  rotulo: string
}

/** Brasileirão: 4 sobem / 4 caem por fronteira, desempate CBF. */
export const PRESET_BRASILEIRAO = {
  vagasPorFronteira: 4,
  desempate: "cbf",
  rotulo: "Brasileirão (4 sobem / 4 caem)",
} as const satisfies PiramidePreset

/** Premier League: 3 sobem / 3 caem por fronteira, desempate inglês (saldo). */
export const PRESET_PREMIER = {
  vagasPorFronteira: 3,
  desempate: "ingles",
  rotulo: "Premier League (3 sobem / 3 caem)",
} as const satisfies PiramidePreset

/** Mapa de presets selecionáveis na UI (mais o "personalizado", sem esqueleto fixo). */
export const PIRAMIDE_PRESETS = {
  brasileirao: PRESET_BRASILEIRAO,
  premier: PRESET_PREMIER,
} as const

export type PiramidePresetId = keyof typeof PIRAMIDE_PRESETS | typeof PRESET_PERSONALIZADO
