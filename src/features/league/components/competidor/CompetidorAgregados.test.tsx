// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CompetidorAgregados } from "@/features/league/components/competidor/CompetidorAgregados"
import type { CompetidorPerfil } from "@/features/league/data/getCompetitorProfile"

afterEach(cleanup)

const PERFIL = {
  id: "c1",
  nome: "Ana",
  escudoUrl: null,
  porNome: true,
  competitionId: "comp1",
  competitionNome: "Pirâmide",
  seasonAtualId: null,
  historico: [],
  temporadasDisputadas: 3,
  totalPontos: 120,
  totalJogos: 40,
  promedio: 3,
  titulos: 1,
  titulosElite: 0,
  acessos: 1,
  quedas: 0,
} satisfies CompetidorPerfil

describe("CompetidorAgregados", () => {
  it("ancora o '?' de ajuda SÓ no rótulo Promédio", () => {
    render(<CompetidorAgregados perfil={PERFIL} />)
    // Um único gatilho de ajuda, o do Promédio (Temporadas/Pontos/Jogos não têm).
    const ajudas = screen.getAllByRole("button", { name: /^O que é / })
    expect(ajudas).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "O que é Promédio?" })
    ).toBeInTheDocument()
  })
})
