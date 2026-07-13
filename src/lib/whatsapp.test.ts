import { describe, expect, it } from "vitest"

import {
  linkWhatsApp,
  mensagemClassificacao,
  mensagemConvocacao,
  mensagemListaTimes,
  mensagemResultado,
  mensagemRodada,
  mensagemTecnico,
  mensagemTemporada,
} from "@/lib/whatsapp"

describe("linkWhatsApp", () => {
  it("celular BR de 11 dígitos ganha o DDI 55", () => {
    expect(linkWhatsApp("11912345678")).toBe("https://wa.me/5511912345678")
  })

  it("aceita máscara (normaliza para dígitos)", () => {
    expect(linkWhatsApp("(11) 91234-5678")).toBe("https://wa.me/5511912345678")
  })

  it("13 dígitos começando com 55 entram diretos (já com DDI)", () => {
    expect(linkWhatsApp("5511912345678")).toBe("https://wa.me/5511912345678")
  })

  it("E.164 internacional usa o DDI embutido (Portugal, EUA, BR)", () => {
    expect(linkWhatsApp("+351931482194")).toBe("https://wa.me/351931482194")
    expect(linkWhatsApp("+14155552671")).toBe("https://wa.me/14155552671")
    expect(linkWhatsApp("+5511912345678")).toBe("https://wa.me/5511912345678")
  })

  it("E.164 também anexa a mensagem em ?text=", () => {
    expect(linkWhatsApp("+351931482194", "Olá!")).toBe(
      `https://wa.me/351931482194?text=${encodeURIComponent("Olá!")}`
    )
  })

  it("formato inválido, vazio ou nulo → null (sem atalho)", () => {
    expect(linkWhatsApp("1234")).toBeNull() // fixo/curto
    expect(linkWhatsApp("5511912345678901")).toBeNull() // longo demais
    // 13 dígitos SEM prefixo 55 não é DDI Brasil — rejeitado.
    expect(linkWhatsApp("9911912345678")).toBeNull()
    // E.164 fora da faixa de 8–15 dígitos → null.
    expect(linkWhatsApp("+12")).toBeNull() // curto demais
    expect(linkWhatsApp("+1234567890123456")).toBeNull() // 16 dígitos
    expect(linkWhatsApp("")).toBeNull()
    expect(linkWhatsApp(null)).toBeNull()
    expect(linkWhatsApp(undefined)).toBeNull()
  })

  it("anexa a mensagem em ?text= com URL-encoding", () => {
    const link = linkWhatsApp("11912345678", "Fala, Beto! Bora?")
    expect(link).toBe(
      `https://wa.me/5511912345678?text=${encodeURIComponent("Fala, Beto! Bora?")}`
    )
  })

  it("sem mensagem o link abre o chat vazio (compat com o uso antigo)", () => {
    expect(linkWhatsApp("11912345678")).not.toContain("?text=")
  })
})

describe("mensagemConvocacao", () => {
  const tournamentId = "11111111-1111-4111-8111-111111111111"

  it("sauda o adversário, cita o torneio e termina com a URL absoluta", () => {
    const msg = mensagemConvocacao({
      adversario: "Beto",
      titulo: "Copa da Firma",
      tournamentId,
    })
    expect(msg).toBe(
      `Fala, Beto! Bora jogar nossa partida do Copa da Firma no Goliseu? http://localhost:3000/dashboard/torneios/${tournamentId}`
    )
  })

  it("sem nome a saudação é genérica; sem título usa o fallback", () => {
    const msg = mensagemConvocacao({ tournamentId })
    expect(msg).toMatch(/^Fala! Bora jogar nossa partida do nosso torneio/)
    // Nome/título só com espaços contam como ausentes.
    expect(
      mensagemConvocacao({ adversario: "  ", titulo: "  ", tournamentId })
    ).toMatch(/^Fala! Bora jogar nossa partida do nosso torneio/)
  })
})

describe("mensagemRodada", () => {
  const tournamentId = "11111111-1111-4111-8111-111111111111"
  const url = `http://localhost:3000/dashboard/torneios/${tournamentId}`

  it("cabeçalho + linha por confronto com comandante e wa.me + URL", () => {
    const msg = mensagemRodada({
      titulo: "Copa da Firma",
      rodada: 3,
      confrontos: [
        {
          lado1: { clube: "Grêmio", comandante: "Ana", celular: "11912345678" },
          lado2: { clube: "Inter", comandante: "Beto", celular: "11987654321" },
        },
      ],
      tournamentId,
    })
    expect(msg).toBe(
      `Copa da Firma — 3a rodada Liberada\n\n` +
        `Grêmio (Ana: https://wa.me/5511912345678) x Inter (Beto: https://wa.me/5511987654321)\n\n` +
        `Acompanhe: ${url}`
    )
  })

  it("separa cada confronto por uma linha em branco (mais espaçado)", () => {
    const msg = mensagemRodada({
      titulo: "Brasileirão",
      rodada: 1,
      confrontos: [
        { lado1: { clube: "Remo", comandante: null }, lado2: { clube: "Galo", comandante: null } },
        { lado1: { clube: "Inter", comandante: null }, lado2: { clube: "Mirassol", comandante: null } },
        { lado1: { clube: "Vasco", comandante: null }, lado2: { clube: "Timão", comandante: null } },
      ],
      tournamentId,
    })
    expect(msg).toBe(
      `Brasileirão — 1a rodada Liberada\n\n` +
        `Remo (❌) x Galo (❌)\n\n` +
        `Inter (❌) x Mirassol (❌)\n\n` +
        `Vasco (❌) x Timão (❌)\n\n` +
        `Acompanhe: ${url}`
    )
    // linha em branco entre blocos — nunca confrontos colados por \n simples.
    expect(msg).toContain("Galo (❌)\n\nInter (❌)")
  })

  it("vaga sem comandante vira ❌; comandante sem celular sai sem wa.me", () => {
    const msg = mensagemRodada({
      titulo: "Liga",
      rodada: 1,
      confrontos: [
        {
          lado1: { clube: "Alfa", comandante: null, celular: null },
          lado2: { clube: "Bravo", comandante: "Caio", celular: null },
        },
      ],
      tournamentId,
    })
    expect(msg).toContain("Alfa (❌) x Bravo (Caio)")
    expect(msg).not.toContain("wa.me")
  })

  it("título ausente usa fallback; sem confrontos só cabeçalho + URL", () => {
    const msg = mensagemRodada({ titulo: "  ", rodada: 2, confrontos: [], tournamentId })
    expect(msg).toBe(`Campeonato — 2a rodada Liberada\n\nAcompanhe: ${url}`)
  })

  it("não contém emoji decorativo (só o ❌ funcional)", () => {
    const msg = mensagemRodada({
      titulo: "X",
      rodada: 1,
      confrontos: [
        { lado1: { clube: "A", comandante: "a", celular: null }, lado2: { clube: "B", comandante: null } },
      ],
      tournamentId,
    })
    // sem emojis de bola/troféu etc.; o ❌ (U+274C) é o único símbolo permitido.
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u)
  })
})

describe("mensagemListaTimes", () => {
  const tournamentId = "11111111-1111-4111-8111-111111111111"
  const url = `http://localhost:3000/dashboard/torneios/${tournamentId}`

  it("cabeçalho 'Times' + uma linha por time + rodapé com a URL", () => {
    const msg = mensagemListaTimes({
      titulo: "Copa da Firma",
      times: [
        { clube: "Grêmio", comandante: "Ana", celular: "11912345678" },
        { clube: "Inter", comandante: "Beto", celular: null },
        { clube: "Vasco", comandante: null, celular: null },
      ],
      tournamentId,
    })
    expect(msg).toBe(
      `Copa da Firma — Times\n\n` +
        `Grêmio — Ana: https://wa.me/5511912345678\n` +
        `Inter — Beto\n` +
        `Vasco — ❌\n\n` +
        `Veja: ${url}`
    )
  })

  it("técnico com celular ganha o link; técnico sem celular sai só com o nome", () => {
    const msg = mensagemListaTimes({
      titulo: "Liga",
      times: [
        { clube: "Alfa", comandante: "Caio", celular: "11987654321" },
        { clube: "Bravo", comandante: "Davi", celular: null },
      ],
      tournamentId,
    })
    expect(msg).toContain("Alfa — Caio: https://wa.me/5511987654321")
    expect(msg).toContain("Bravo — Davi")
    // o nome do Bravo não vira link (sem celular) — só uma ocorrência de wa.me.
    expect(msg.match(/wa\.me/g)?.length).toBe(1)
  })

  it("só time SEM técnico vira ❌; técnico presente (mesmo 'Sem nome') nunca vira ❌", () => {
    const msg = mensagemListaTimes({
      titulo: "Liga",
      times: [
        { clube: "Órfão", comandante: null, celular: null },
        // técnico presente sem nome cadastrado já chega com o fallback "Sem nome".
        { clube: "Ocupado", comandante: "Sem nome", celular: null },
      ],
      tournamentId,
    })
    expect(msg).toContain("Órfão — ❌")
    expect(msg).toContain("Ocupado — Sem nome")
    // exatamente um ❌ (só o órfão) — o slot ocupado não recebe ❌.
    expect(msg.match(/❌/g)?.length).toBe(1)
  })

  it("título ausente usa fallback; sem times só cabeçalho + URL", () => {
    const msg = mensagemListaTimes({ titulo: "  ", times: [], tournamentId })
    expect(msg).toBe(`Campeonato — Times\n\nVeja: ${url}`)
  })

  it("não contém emoji decorativo (só o ❌ funcional)", () => {
    const msg = mensagemListaTimes({
      titulo: "X",
      times: [{ clube: "A", comandante: null, celular: null }],
      tournamentId,
    })
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u)
  })
})

const TID = "11111111-1111-4111-8111-111111111111"

describe("mensagemResultado", () => {
  it("placar normal com título e URL", () => {
    const msg = mensagemResultado({
      titulo: "Copa",
      nome1: "A",
      nome2: "B",
      placar1: 2,
      placar2: 1,
      tournamentId: TID,
    })
    expect(msg).toContain("Copa — Resultado")
    expect(msg).toContain("A 2 x 1 B")
    expect(msg).toContain(`/dashboard/torneios/${TID}`)
  })

  it("diferença ≥ 3 e sem W.O. marca Goleada", () => {
    const msg = mensagemResultado({
      titulo: "Copa",
      nome1: "A",
      nome2: "B",
      placar1: 5,
      placar2: 0,
      tournamentId: TID,
    })
    expect(msg).toContain("Goleada")
  })

  it("W.O. simples nomeia o vencedor", () => {
    const msg = mensagemResultado({
      nome1: "A",
      nome2: "B",
      placar1: 0,
      placar2: 0,
      wo: true,
      woVencedorLado: 2,
      tournamentId: TID,
    })
    expect(msg).toContain("W.O. (B venceu)")
    expect(msg).not.toContain("Goleada")
  })

  it("W.O. duplo não afirma vencedor", () => {
    const msg = mensagemResultado({
      nome1: "A",
      nome2: "B",
      placar1: 0,
      placar2: 0,
      wo: true,
      woDuplo: true,
      tournamentId: TID,
    })
    expect(msg).toContain("W.O. duplo")
    expect(msg).not.toContain("venceu")
  })

  it("sem título usa fallback e sem emoji decorativo", () => {
    const msg = mensagemResultado({
      nome1: "A",
      nome2: "B",
      placar1: 1,
      placar2: 1,
      tournamentId: TID,
    })
    expect(msg).toContain("Campeonato — Resultado")
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u)
  })
})

describe("mensagemClassificacao", () => {
  it("torneio: título, líder e URL da página do torneio", () => {
    const msg = mensagemClassificacao({
      titulo: "Brasileirão",
      lider: "Palmeiras",
      href: `/dashboard/torneios/${TID}`,
    })
    expect(msg).toContain("Brasileirão — Classificação")
    expect(msg).toContain("Palmeiras")
    expect(msg).toContain(`/dashboard/torneios/${TID}`)
  })

  it("sem líder omite a linha do topo (tabela vazia)", () => {
    const msg = mensagemClassificacao({
      titulo: "Liga",
      lider: null,
      href: `/dashboard/torneios/${TID}`,
    })
    expect(msg).toContain("Liga — Classificação")
    expect(msg).not.toContain("Líder")
  })
})

describe("mensagemTemporada", () => {
  it("compõe título e URL da temporada", () => {
    const msg = mensagemTemporada({
      titulo: "Pirâmide — Temporada 3",
      href: `/dashboard/ligas/${TID}`,
    })
    expect(msg).toContain("Pirâmide — Temporada 3")
    expect(msg).toContain(`/dashboard/ligas/${TID}`)
  })
})

describe("mensagemTecnico", () => {
  it("compõe nome do técnico e URL do perfil", () => {
    const msg = mensagemTecnico({
      nome: "Fulano",
      userId: TID,
    })
    expect(msg).toContain("Fulano")
    expect(msg).toContain(`/dashboard/ligas/tecnico/${TID}`)
    expect(msg).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u)
  })
})
