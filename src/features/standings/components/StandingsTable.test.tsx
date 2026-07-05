// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { StandingsTable } from "@/features/standings/components/StandingsTable"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

// Captura a prop `prefetch` do next/link (que NÃO vira atributo do DOM) num
// data-attr, para afirmar o contrato "sem prefetch em massa" do link de
// competidor. Não interfere nas smoke tests (elas não geram link).
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: ReactNode
    href: string
    prefetch?: boolean | null
  } & Record<string, unknown>) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}))

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

  it("o link de competidor NÃO dispara prefetch automático (prefetch={false})", () => {
    const { container } = render(
      <StandingsTable
        linhas={[linha]}
        hrefCompetidorBase="/dashboard/ligas/competidor"
      />,
    )
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/dashboard/ligas/competidor/p1"]',
    )
    // Navegação por clique intacta (o link existe e aponta pro competidor)...
    expect(link).not.toBeNull()
    // ...mas sem o prefetch no viewport que causaria a rajada de RSC (N+1 → 503).
    expect(link).toHaveAttribute("data-prefetch", "false")
  })

  it("sem hrefCompetidorBase o nome é texto puro, sem link (torneio avulso)", () => {
    const { container } = render(<StandingsTable linhas={[linha]} />)
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("Time Um")
  })

  it("sem formaPorParticipante NÃO renderiza a coluna Forma (legado)", () => {
    const { queryByText } = render(<StandingsTable linhas={[linha]} />)
    expect(queryByText("Forma nos últimos jogos")).toBeNull()
  })

  it("com formaPorParticipante renderiza a coluna Forma com aria-label (oculta no 'caber')", () => {
    const forma = new Map([
      ["p1", [{ resultado: "V" as const, wo: false, rodada: 1 }]],
    ])
    const { container, getByLabelText } = render(
      <StandingsTable linhas={[linha]} formaPorParticipante={forma} />,
    )
    // Badge com rótulo acessível (não só cor).
    expect(getByLabelText("Vitória")).toBeInTheDocument()
    // Coluna oculta no modo compacto para preservar o encaixe mobile.
    const th = [...container.querySelectorAll("th")].find((e) =>
      e.textContent?.includes("Forma"),
    )
    expect(th?.className).toContain("group-data-[modo=caber]/standings:hidden")
  })
})
