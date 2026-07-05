// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// O modal embute busca de clube (action) e toasts — neutralizados: o alvo é
// a fiação POR COLUNA do atalho wa.me (cenário do delta match-score-modal).
vi.mock("@/actions/teams", () => ({
  searchTeams: vi.fn(),
  selectTeam: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import type { ComponentProps } from "react"
import { toast } from "sonner"

import { MatchScoreModal } from "@/features/match/components/MatchScoreModal"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("MatchScoreModal — atalho wa.me com mensagem POR COLUNA", () => {
  it("cada coluna convocável abre o chat do PRÓPRIO lado com a SUA mensagem (sem cross-wiring)", () => {
    // Ambos convocáveis aqui é artificial (no produto só o adversário é) — o
    // alvo é a fiação POR COLUNA: cada link aponta ao seu número/mensagem.
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ana x Beto"
        subtitulo="Copa da Firma • em andamento"
        descricao="Ana enfrenta Beto"
        participante1={{
          nome: "Ana",
          celular: "11911111111",
          mensagemWhatsApp: "Fala, Ana! Bora?",
          convocavel: true,
        }}
        participante2={{
          nome: "Beto",
          celular: "11922222222",
          mensagemWhatsApp: "Fala, Beto! Bora?",
          convocavel: true,
        }}
      />
    )
    fireEvent.click(screen.getByRole("button"))

    const linkAna = screen.getByRole("link", { name: /Chamar Ana/ })
    const linkBeto = screen.getByRole("link", { name: /Chamar Beto/ })
    // Número E mensagem do lado certo — um swap de fiação trocaria a saudação.
    expect(linkAna).toHaveAttribute(
      "href",
      `https://wa.me/5511911111111?text=${encodeURIComponent("Fala, Ana! Bora?")}`
    )
    expect(linkBeto).toHaveAttribute(
      "href",
      `https://wa.me/5511922222222?text=${encodeURIComponent("Fala, Beto! Bora?")}`
    )
  })

  it("sem mensagemWhatsApp o chat abre vazio (compat com o uso demo)", () => {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ana x Beto"
        subtitulo="Demo"
        descricao="Ana enfrenta Beto"
        participante1={{ nome: "Ana", celular: "11911111111", convocavel: true }}
        participante2={{ nome: "Beto", celular: null, convocavel: true }}
      />
    )
    fireEvent.click(screen.getByRole("button"))
    const linkAna = screen.getByRole("link", { name: /Chamar Ana/ })
    expect(linkAna.getAttribute("href")).toBe("https://wa.me/5511911111111")
    // Sem celular válido a coluna não tem botão.
    expect(screen.queryByRole("link", { name: /Chamar Beto/ })).toBeNull()
  })

  it("competitivo (sem onSelecionarClube): clube só é exibido, sem campo 'Buscar clube'", () => {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Bahia x Flamengo"
        subtitulo="Brasileirão • agendada"
        descricao="Bahia enfrenta Flamengo"
        participante1={{ nome: "Bahia", convocavel: false }}
        participante2={{ nome: "Flamengo", convocavel: false }}
      />
    )
    fireEvent.click(screen.getByRole("button"))
    // O clube vem do torneio: sem busca para trocá-lo.
    expect(screen.queryByPlaceholderText(/Buscar clube/)).toBeNull()
  })

  it("avulso (com onSelecionarClube): mostra a busca de clube em cada lado", () => {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ana x Beto"
        subtitulo="Avulso • agendada"
        descricao="Ana enfrenta Beto"
        participante1={{ nome: "Ana", convocavel: false }}
        participante2={{ nome: "Beto", convocavel: false }}
        onSelecionarClube={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getAllByPlaceholderText(/Buscar clube/)).toHaveLength(2)
  })

  it("não há auto-chamada: o lado NÃO convocável (próprio usuário) não tem botão mesmo com celular", () => {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Eu x Rival"
        subtitulo="Copa da Firma • em andamento"
        descricao="Eu enfrento Rival"
        // O usuário logado: tem celular, mas NÃO é convocável (não se chama).
        participante1={{ nome: "Eu", celular: "11911111111", convocavel: false }}
        // O adversário: convocável.
        participante2={{
          nome: "Rival",
          celular: "11922222222",
          mensagemWhatsApp: "Fala, Rival! Bora?",
          convocavel: true,
        }}
      />
    )
    fireEvent.click(screen.getByRole("button"))
    // Só o adversário tem botão.
    expect(screen.getByRole("link", { name: /Chamar Rival/ })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Chamar Eu/ })).toBeNull()
  })
})

describe("MatchScoreModal — modo proposta (placar com foto p/ aprovação)", () => {
  // O modal abre por um Dialog: clicar no trigger monta o conteúdo; só então o
  // input de foto e o botão principal existem na árvore.
  function abrir(props: Partial<ComponentProps<typeof MatchScoreModal>> = {}) {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ana x Beto"
        subtitulo="Copa da Firma • em andamento"
        descricao="Ana enfrenta Beto"
        participante1={{ nome: "Ana", convocavel: false }}
        participante2={{ nome: "Beto", convocavel: false }}
        {...props}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Menu da Partida/ }))
  }

  function botaoPrincipal(nome: RegExp) {
    return screen.getByRole("button", { name: nome })
  }

  it("(a) exibe o input de foto e o botão 'Enviar para aprovação' desabilitado sem foto", () => {
    abrir({ modoPlacar: "proposta", onEnviarProposta: vi.fn() })

    // Título da seção vira o de aprovação.
    expect(screen.getByText("Enviar placar para aprovação")).toBeInTheDocument()
    // Input de foto obrigatório está presente.
    expect(document.getElementById("foto-evidencia")).toBeInTheDocument()
    // Botão principal com o rótulo de proposta, desabilitado enquanto não há foto.
    const enviar = botaoPrincipal(/Enviar para aprovação/)
    expect(enviar).toBeDisabled()
  })

  it("(b) selecionar um File habilita o botão e o submit chama onEnviarProposta com a foto", async () => {
    const onEnviarProposta = vi.fn().mockResolvedValue(undefined)
    abrir({
      modoPlacar: "proposta",
      placarInicial1: 3,
      placarInicial2: 1,
      onEnviarProposta,
    })

    const input = document.getElementById("foto-evidencia") as HTMLInputElement
    const file = new File(["bytes"], "evidencia.png", { type: "image/png" })
    fireEvent.change(input, { target: { files: [file] } })

    const enviar = botaoPrincipal(/Enviar para aprovação/)
    expect(enviar).toBeEnabled()

    fireEvent.click(enviar)

    await waitFor(() => {
      expect(onEnviarProposta).toHaveBeenCalledWith({
        matchId: "m1",
        placar_1: 3,
        placar_2: 1,
        foto: file,
      })
    })
    expect(toast.success).toHaveBeenCalledWith("Placar enviado para aprovação.")
  })

  it("(b') confirmar SEM foto dá toast.error e NÃO chama onEnviarProposta", () => {
    const onEnviarProposta = vi.fn()
    abrir({ modoPlacar: "proposta", onEnviarProposta })

    // O botão está disabled (caminho feliz), mas o guard interno também barra:
    // disparamos o handler direto para cobrir a recusa SEM foto.
    fireEvent.click(botaoPrincipal(/Enviar para aprovação/))

    expect(onEnviarProposta).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("(c) modo 'direto' (default) chama onSave e não mostra o input de foto", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    abrir({ placarInicial1: 2, placarInicial2: 2, onSave })

    // Seção de lançamento direto, sem input de foto.
    expect(screen.getByText("Lançar placar")).toBeInTheDocument()
    expect(document.getElementById("foto-evidencia")).toBeNull()
    expect(screen.queryByText("Enviar placar para aprovação")).toBeNull()

    fireEvent.click(botaoPrincipal(/Salvar placar/))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        matchId: "m1",
        placar_1: 2,
        placar_2: 2,
      })
    })
    // onEnviarProposta nunca é envolvido no modo direto.
    expect(toast.success).toHaveBeenCalledWith("Placar salvo.")
  })
})

describe("MatchScoreModal — captura de autores de gols (add-artilharia)", () => {
  function abrir(props: Partial<ComponentProps<typeof MatchScoreModal>> = {}) {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ataias x João"
        subtitulo="Série A • em andamento"
        descricao="Ataias enfrenta João"
        participante1={{ nome: "Ataias", convocavel: false }}
        participante2={{ nome: "João", convocavel: false }}
        {...props}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Menu da Partida/ }))
  }

  it("sem vaga (avulso) NÃO exibe a captura de autores", () => {
    abrir({ onSave: vi.fn(), placarInicial1: 1 })
    expect(screen.queryByText("Autores dos gols (opcional)")).toBeNull()
    expect(screen.queryByRole("button", { name: /Adicionar autor/ })).toBeNull()
  })

  it("com vaga (competitivo) exibe a captura só no(s) lado(s) com vaga", () => {
    // Só o lado 1 tem vaga → só ele ganha a captura de autores.
    abrir({ onSave: vi.fn(), vagaId1: "v1", placarInicial1: 2 })
    expect(screen.getByText("Autores dos gols (opcional)")).toBeInTheDocument()
    // Um único "Adicionar autor" (lado 1); o lado 2 (sem vaga) não tem.
    expect(
      screen.getAllByRole("button", { name: /Adicionar autor/ })
    ).toHaveLength(1)
  })

  it("modo direto: envia os autores informados por onSave", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    abrir({ onSave, vagaId1: "v1", placarInicial1: 2 })

    fireEvent.click(screen.getByRole("button", { name: /Adicionar autor/ }))
    fireEvent.change(screen.getByLabelText("Autor 1 de Ataias"), {
      target: { value: "Endrick" },
    })
    // gols default = 1; aumenta para 2 (dentro do placar 2).
    fireEvent.click(screen.getByRole("button", { name: /Aumentar gols de Endrick/ }))

    fireEvent.click(screen.getByRole("button", { name: /Salvar placar/ }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        matchId: "m1",
        placar_1: 2,
        placar_2: 0,
        autores: [{ lado: 1, jogador: "Endrick", gols: 2 }],
      })
    })
  })

  it("soma de autores acima do placar do lado BLOQUEIA o envio", () => {
    const onSave = vi.fn()
    // Placar do lado 1 = 1, mas o autor terá 2 gols.
    abrir({ onSave, vagaId1: "v1", placarInicial1: 1 })

    fireEvent.click(screen.getByRole("button", { name: /Adicionar autor/ }))
    fireEvent.change(screen.getByLabelText("Autor 1 de Ataias"), {
      target: { value: "Endrick" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Aumentar gols de Endrick/ }))

    // Aviso inline aparece; o submit é recusado com toast e onSave não roda.
    expect(
      screen.getByText(/somam mais gols que o placar deste lado/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Salvar placar/ }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it("sem tocar na captura, onSave NÃO recebe autores (preserva os atuais)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    abrir({ onSave, vagaId1: "v1", placarInicial1: 3 })

    fireEvent.click(screen.getByRole("button", { name: /Salvar placar/ }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        matchId: "m1",
        placar_1: 3,
        placar_2: 0,
      })
    })
    // `autores` ausente = undefined: a action não toca os gols já gravados.
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("autores", expect.anything())
    expect(onSave.mock.calls[0][0].autores).toBeUndefined()
  })

  it("modo proposta: envia os autores junto da foto", async () => {
    const onEnviarProposta = vi.fn().mockResolvedValue(undefined)
    abrir({
      modoPlacar: "proposta",
      onEnviarProposta,
      vagaId1: "v1",
      placarInicial1: 1,
    })

    const inputFoto = document.getElementById("foto-evidencia") as HTMLInputElement
    const file = new File(["b"], "e.png", { type: "image/png" })
    fireEvent.change(inputFoto, { target: { files: [file] } })

    fireEvent.click(screen.getByRole("button", { name: /Adicionar autor/ }))
    fireEvent.change(screen.getByLabelText("Autor 1 de Ataias"), {
      target: { value: "Vini" },
    })

    fireEvent.click(screen.getByRole("button", { name: /Enviar para aprovação/ }))
    await waitFor(() => {
      expect(onEnviarProposta).toHaveBeenCalledWith({
        matchId: "m1",
        placar_1: 1,
        placar_2: 0,
        foto: file,
        autores: [{ lado: 1, jogador: "Vini", gols: 1 }],
      })
    })
  })

  it("autocomplete: popula o <datalist> com as sugestões do competidor", async () => {
    const carregarSugestoes = vi.fn().mockResolvedValue(["Endrick", "Vini"])
    abrir({ onSave: vi.fn(), vagaId1: "v1", carregarSugestoes, placarInicial1: 2 })

    await waitFor(() => {
      expect(document.querySelector('option[value="Endrick"]')).not.toBeNull()
    })
    expect(document.querySelector('option[value="Vini"]')).not.toBeNull()
    // Escopado à vaga do lado 1.
    expect(carregarSugestoes).toHaveBeenCalledWith("v1")
  })
})
