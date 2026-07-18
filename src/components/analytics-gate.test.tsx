// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// A telemetria da Vercel é suprimida na subárvore /demo (nenhuma integração
// externa no modo demonstração) e mantida em qualquer outra rota.
const mockUsePathname = vi.fn()
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))
vi.mock("@vercel/analytics/next", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}))
vi.mock("@vercel/speed-insights/next", () => ({
  SpeedInsights: () => <div data-testid="vercel-speed" />,
}))

import { AnalyticsGate } from "./analytics-gate"

afterEach(cleanup)

describe("AnalyticsGate", () => {
  it("não renderiza telemetria em rotas /demo", () => {
    mockUsePathname.mockReturnValue("/demo/torneios/demo-liga")
    const { queryByTestId } = render(<AnalyticsGate />)
    expect(queryByTestId("vercel-analytics")).not.toBeInTheDocument()
    expect(queryByTestId("vercel-speed")).not.toBeInTheDocument()
  })

  it("renderiza telemetria fora do /demo", () => {
    mockUsePathname.mockReturnValue("/dashboard")
    const { queryByTestId } = render(<AnalyticsGate />)
    expect(queryByTestId("vercel-analytics")).toBeInTheDocument()
    expect(queryByTestId("vercel-speed")).toBeInTheDocument()
  })
})
