// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { StandingsRow } from "@/features/standings/components/StandingsRow"
import { StandingsModoProvider } from "@/features/standings/components/standingsModoContext"
import type { EstiloLinha } from "@/features/standings/components/standingsCells"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

afterEach(cleanup)

const linha: LinhaComNome = {
  participanteId: "p1",
  nome: "Time Um",
  posicao: 2,
  pontos: 4,
  jogos: 2,
  vitorias: 1,
  empates: 1,
  derrotas: 0,
  golsPro: 5,
  golsContra: 2,
  saldo: 3,
  escudoUrl: null,
  avatarUrl: null,
}

const estilo: EstiloLinha = {
  ehLider: false,
  faixa: "",
  temFaixa: false,
  ehPlayoffMarcado: false,
  tom: "",
  zonaLabel: null,
}

function renderRow(compacto: boolean) {
  return render(
    <StandingsModoProvider value={{ compacto }}>
      <table>
        <tbody>
          <StandingsRow
            linha={linha}
            estilo={estilo}
            temPromedio={false}
            temForma={false}
            colSpanN={10}
          />
        </tbody>
      </table>
    </StandingsModoProvider>,
  )
}

describe("StandingsRow (disclosure por estado, sem matchMedia)", () => {
  it("compacto: expõe o gatilho aria-expanded=false e revela o detalhe ao acionar", async () => {
    renderRow(true)
    const botao = screen.getByRole("button")
    expect(botao).toHaveAttribute("aria-expanded", "false")
    // Detalhe montado no DOM (para o IDREF resolver) mas OCULTO até abrir.
    expect(screen.getByText("Vitórias:")).not.toBeVisible()

    await userEvent.click(botao)
    expect(botao).toHaveAttribute("aria-expanded", "true")
    // Estatísticas secundárias reveladas como pares rótulo→valor.
    expect(screen.getByText("Vitórias:")).toBeVisible()
    expect(screen.getByText("Gols contra:")).toBeVisible()

    await userEvent.click(botao)
    expect(botao).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("Vitórias:")).not.toBeVisible()
  })

  it("aria-controls SEMPRE resolve — o alvo existe mesmo COLAPSADO (sem IDREF pendurado)", async () => {
    renderRow(true)
    const botao = screen.getByRole("button")
    const alvo = botao.getAttribute("aria-controls")
    expect(alvo).toBeTruthy()
    // Colapsado: o elemento-alvo já existe no DOM (apenas hidden).
    const detalhe = document.getElementById(alvo!)
    expect(detalhe).not.toBeNull()
    expect(detalhe).toHaveAttribute("hidden")
    // Ao abrir, o mesmo alvo continua existindo e deixa de ser hidden.
    await userEvent.click(botao)
    expect(document.getElementById(alvo!)).not.toBeNull()
    expect(document.getElementById(alvo!)).not.toHaveAttribute("hidden")
  })

  it("desktop (não compacto): NENHUM gatilho de expansão é renderizado", () => {
    renderRow(false)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByText("Vitórias:")).toBeNull()
  })
})
