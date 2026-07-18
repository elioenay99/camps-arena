import { describe, expect, it } from "vitest"

import { flagsDoPerfil } from "./perfil"

describe("flagsDoPerfil (permissões simuladas de UI)", () => {
  it("visitante não tem nenhuma permissão de gestão", () => {
    const f = flagsDoPerfil("visitante")
    expect(f.podeGerir).toBe(false)
    expect(f.podeModerar).toBe(false)
    expect(f.podeArbitrar).toBe(false)
  })

  it("tecnico não desbloqueia gestão do campeonato", () => {
    expect(flagsDoPerfil("tecnico").podeGerir).toBe(false)
  })

  it("gestor pode gerir e moderar", () => {
    const f = flagsDoPerfil("gestor")
    expect(f.podeGerir).toBe(true)
    expect(f.podeModerar).toBe(true)
    expect(f.podeVerBastidores).toBe(false)
  })

  it("admin vê bastidores além de gerir", () => {
    const f = flagsDoPerfil("admin")
    expect(f.podeGerir).toBe(true)
    expect(f.podeVerBastidores).toBe(true)
  })
})
