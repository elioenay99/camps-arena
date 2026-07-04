// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { StandingsTable } from "@/features/standings/components/StandingsTable"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

afterEach(cleanup)

const linha: LinhaComNome = {
  participanteId: "p1",
  nome: "Time Um",
  posicao: 1,
  pontos: 3,
  jogos: 1,
  vitorias: 1,
  empates: 0,
  derrotas: 0,
  golsPro: 2,
  golsContra: 1,
  saldo: 1,
  escudoUrl: null,
  avatarUrl: null,
}

describe("StandingsTable (smoke)", () => {
  it("renderiza a tabela e o nome do time", () => {
    const { container } = render(<StandingsTable linhas={[linha]} />)
    expect(container.querySelector("table")).not.toBeNull()
    expect(container.textContent).toContain("Time Um")
  })

  it("a tabela carrega as classes do modo 'caber' (reage ao data-modo do wrapper)", () => {
    const { container } = render(<StandingsTable linhas={[linha]} />)
    const cls = container.querySelector("table")!.className
    expect(cls).toContain("group-data-[modo=caber]/standings:min-w-0")
    expect(cls).toContain("group-data-[modo=caber]/standings:text-xs")
  })
})
