// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SearchTeamsResult } from "@/actions/teams"
import type { TeamResult } from "@/schema/teamSchema"

// next/image → <img> simples; repassa onError p/ exercitar o fallback do escudo.
vi.mock("next/image", () => ({
  default: (props: { src: unknown; alt?: string; onError?: () => void }) => {
    const src = typeof props.src === "string" ? props.src : ""
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={props.alt ?? ""} onError={props.onError} />
  },
}))
vi.mock("@/actions/teams", () => ({ searchTeams: vi.fn() }))

import { searchTeams } from "@/actions/teams"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"

const mockSearch = vi.mocked(searchTeams)

const FLA: TeamResult = { externalId: "127", nome: "Flamengo", escudoUrl: null }
const FLA_W: TeamResult = { externalId: "2", nome: "Flamengo W", escudoUrl: null }
const GREMIO: TeamResult = {
  externalId: "130",
  nome: "Grêmio",
  escudoUrl: "https://media.api-sports.io/football/teams/130.png",
}

// Helpers que amarram o retorno do mock ao contrato real (drift quebra a compilação).
const ok = (teams: TeamResult[]): SearchTeamsResult => ({ ok: true, teams })
const fail = (error: string): SearchTeamsResult => ({ ok: false, error })

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe("TeamSearchInput", () => {
  it("não busca com menos de 3 caracteres", async () => {
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "fl")
    // Ramo <3 agenda setTimeout(0) e NÃO chama searchTeams: basta 1 macrotask.
    await new Promise((r) => setTimeout(r, 0))
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("busca e lista clubes a partir de 3 caracteres", async () => {
    mockSearch.mockResolvedValue(ok([FLA, FLA_W]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "fla")
    expect(await screen.findByText("Flamengo")).toBeInTheDocument()
    expect(screen.getByText("Flamengo W")).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalledWith("fla")
  })

  it("expõe opções como role=option dentro de role=listbox, com aria-selected no destaque", async () => {
    mockSearch.mockResolvedValue(ok([FLA, FLA_W]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    const opts = await screen.findAllByRole("option")
    expect(opts).toHaveLength(2)
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(opts[0]).toHaveAttribute("aria-selected", "true") // highlight default = 0
    expect(opts[1]).toHaveAttribute("aria-selected", "false")
    expect(cb.getAttribute("aria-activedescendant")).toBe(opts[0].id)
  })

  it("alterna aria-expanded e vincula aria-controls ao listbox", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    expect(cb).toHaveAttribute("aria-expanded", "false")
    expect(cb).toHaveAttribute("aria-autocomplete", "list")
    await user.type(cb, "fla")
    const listbox = await screen.findByRole("listbox")
    expect(cb).toHaveAttribute("aria-expanded", "true")
    expect(cb.getAttribute("aria-controls")).toBe(listbox.id)
    await user.keyboard("{Escape}")
    expect(cb).toHaveAttribute("aria-expanded", "false")
  })

  it("chama onSelect ao clicar numa opção", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={onSelect} />)
    await user.type(screen.getByRole("combobox"), "fla")
    await user.click(await screen.findByText("Flamengo"))
    expect(onSelect).toHaveBeenCalledWith(FLA)
  })

  it("seleciona pelo teclado (Enter na opção destacada)", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={onSelect} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    await screen.findByText("Flamengo")
    await user.keyboard("{Enter}")
    expect(onSelect).toHaveBeenCalledWith(FLA)
  })

  it("navega com setas e reflete em aria-activedescendant/aria-selected", async () => {
    mockSearch.mockResolvedValue(ok([FLA, FLA_W]))
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={onSelect} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    const opts = await screen.findAllByRole("option")
    expect(opts[0]).toHaveAttribute("aria-selected", "true")
    expect(cb.getAttribute("aria-activedescendant")).toBe(opts[0].id)
    await user.keyboard("{ArrowDown}") // 0 -> 1
    expect(opts[1]).toHaveAttribute("aria-selected", "true")
    expect(cb.getAttribute("aria-activedescendant")).toBe(opts[1].id)
    await user.keyboard("{ArrowDown}") // clamp no fim
    expect(opts[1]).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{ArrowUp}{ArrowUp}") // volta e para em 0 (não -1)
    expect(opts[0]).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onSelect).toHaveBeenCalledWith(FLA_W)
  })

  it("após selecionar, preenche o input e fecha a lista sem rebuscar", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla") // 1 busca
    await user.click(await screen.findByText("Flamengo")) // escolher -> setQuery('Flamengo')
    expect(cb).toHaveValue("Flamengo")
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 500)) // passa o debounce do effect disparado por setQuery
    expect(mockSearch).toHaveBeenCalledTimes(1) // skipSearch suprimiu a 2ª busca
  })

  it("Escape fecha só a lista e interrompe a propagação (não fecha o Dialog pai)", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const user = userEvent.setup()
    const onParentKeyDown = vi.fn()
    render(
      <div onKeyDown={onParentKeyDown}>
        <TeamSearchInput onSelect={vi.fn()} />
      </div>
    )
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    await screen.findByText("Flamengo")
    onParentKeyDown.mockClear() // ignora os keydowns da digitação ("f","l","a")
    await user.keyboard("{Escape}")
    expect(screen.queryByText("Flamengo")).toBeNull() // lista fechou
    expect(onParentKeyDown).not.toHaveBeenCalled() // stopPropagation impediu o pai (Dialog)
  })

  it("coalesce a digitação rápida em uma única chamada da action", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const user = userEvent.setup({ delay: null }) // sem atraso entre teclas, força a coalescência
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "flamengo")
    await screen.findByText("Flamengo")
    expect(mockSearch).toHaveBeenCalledTimes(1)
    expect(mockSearch).toHaveBeenCalledWith("flamengo")
  })

  it("limpa os resultados ao voltar para menos de 3 caracteres, sem nova busca", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    await screen.findByText("Flamengo")
    await user.type(cb, "{Backspace}") // -> 'fl'
    await waitFor(() => expect(screen.queryByText("Flamengo")).toBeNull())
    expect(mockSearch).toHaveBeenCalledTimes(1) // o recuo não disparou nova busca
  })

  it("descarta resposta obsoleta quando duas buscas se sobrepõem", async () => {
    let resolveLenta!: (v: SearchTeamsResult) => void
    mockSearch
      .mockImplementationOnce(() => new Promise((res) => { resolveLenta = res }))
      .mockResolvedValueOnce(ok([FLA_W]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")

    // 1ª busca PRECISA disparar de fato (esperar o debounce estourar), senão o
    // próximo keystroke cancela o timer e nunca há sobreposição.
    await user.type(cb, "fla")
    await waitFor(() => expect(mockSearch).toHaveBeenNthCalledWith(1, "fla"))

    // 2ª busca dispara e resolve já (FLA_W) — reqId avança.
    await user.type(cb, "m")
    await waitFor(() => expect(mockSearch).toHaveBeenNthCalledWith(2, "flam"))
    await screen.findByText("Flamengo W")

    // resposta antiga ("fla") chega depois — deve ser descartada pela guarda de reqId.
    resolveLenta(ok([FLA]))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByText("Flamengo W")).toBeInTheDocument()
    expect(screen.queryByText("Flamengo")).toBeNull()
  })

  it("mostra 'Buscando…' (role=status) enquanto a action está em voo", async () => {
    mockSearch.mockImplementation(() => new Promise<SearchTeamsResult>(() => {})) // nunca resolve
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "fla")
    expect(await screen.findByText("Buscando…")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Buscando…")
  })

  it("anuncia o erro via role=alert, sem opções e com aria-expanded=false", async () => {
    mockSearch.mockResolvedValue(fail("Busca indisponível."))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "xyz")
    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("Busca indisponível.")
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
    expect(cb).toHaveAttribute("aria-expanded", "false")
  })

  it("não abre lista nem 'option' quando a busca retorna vazio", async () => {
    mockSearch.mockResolvedValue(ok([]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "zzz")
    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("zzz"))
    // estado vazio (ok:true, teams:[]) não abre lista nem vira "erro"
    expect(screen.queryByText("Nenhum clube encontrado.")).toBeNull()
    expect(screen.queryByRole("option")).toBeNull()
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(cb).toHaveAttribute("aria-expanded", "false")
    expect(cb).not.toHaveAttribute("aria-activedescendant")
  })

  it("fecha a lista ao perder o foco (após ~120ms)", async () => {
    mockSearch.mockResolvedValue(ok([FLA]))
    const user = userEvent.setup()
    render(<TeamSearchInput onSelect={vi.fn()} />)
    const cb = screen.getByRole("combobox")
    await user.type(cb, "fla")
    await screen.findByText("Flamengo")
    cb.blur()
    await waitFor(() => expect(screen.queryByText("Flamengo")).toBeNull())
  })

  it("renderiza o escudo do clube na lista e cai para o placeholder se a imagem falhar", async () => {
    mockSearch.mockResolvedValue(ok([GREMIO]))
    const user = userEvent.setup()
    const { container } = render(<TeamSearchInput onSelect={vi.fn()} />)
    await user.type(screen.getByRole("combobox"), "gre")
    await screen.findByText("Grêmio")
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute("src", GREMIO.escudoUrl)
    fireEvent.error(img!)
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("G")).toBeInTheDocument()
  })
})
