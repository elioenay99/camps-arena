// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/image", () => ({
  default: (props: { src: unknown; alt?: string }) => {
    const src = typeof props.src === "string" ? props.src : ""
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={props.alt ?? ""} />
  },
}))
vi.mock("@/actions/teams", () => ({ searchTeams: vi.fn() }))

import { searchTeams } from "@/actions/teams"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"

const mockSearch = vi.mocked(searchTeams)
const FLA = { externalId: "127", nome: "Flamengo", escudoUrl: null }
const FLA_W = { externalId: "2", nome: "Flamengo W", escudoUrl: null }

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe("TeamSearchInput", () => {
  it("não busca com menos de 3 caracteres", async () => {
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "fl")
    await new Promise((r) => setTimeout(r, 500)) // passa o debounce
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("busca e lista clubes a partir de 3 caracteres", async () => {
    mockSearch.mockResolvedValue({ ok: true, teams: [FLA, FLA_W] })
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "fla")
    expect(await screen.findByText("Flamengo")).toBeInTheDocument()
    expect(screen.getByText("Flamengo W")).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalledWith("fla")
  })

  it("chama onSelect ao clicar numa opção", async () => {
    mockSearch.mockResolvedValue({ ok: true, teams: [FLA] })
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={onSelect} />)
    await user.type(screen.getByRole("combobox"), "fla")
    await user.click(await screen.findByText("Flamengo"))
    expect(onSelect).toHaveBeenCalledWith(FLA)
  })

  it("seleciona pelo teclado (Enter na opção destacada)", async () => {
    mockSearch.mockResolvedValue({ ok: true, teams: [FLA] })
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={onSelect} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    await screen.findByText("Flamengo")
    await user.keyboard("{Enter}")
    expect(onSelect).toHaveBeenCalledWith(FLA)
  })

  it("mostra mensagem de erro quando a busca falha", async () => {
    mockSearch.mockResolvedValue({ ok: false, error: "Busca indisponível." })
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "xyz")
    expect(await screen.findByText("Busca indisponível.")).toBeInTheDocument()
  })
})
