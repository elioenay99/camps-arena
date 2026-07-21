import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

// Guard de ESCOPO da barra de navegação inferior (change mobile-nav-densidade).
//
// A barra é da subárvore AUTENTICADA: não pode aparecer na landing pública nem
// em /demo, que tem shell próprio e um guard de isolamento que proíbe importar
// do app privado. Um render de teste não pega isso — um `<BottomNav />` colado
// no root layout passaria por todos os testes de unidade e apareceria em TODA
// rota, inclusive nas públicas. Este teste afirma quem tem permissão de montá-la.

const SRC = resolve(__dirname, "../../")
const EXTS = [".ts", ".tsx"]

/** Único arquivo autorizado a importar/renderizar a barra. */
const AUTORIZADOS = ["app/dashboard/layout.tsx"]

function listarArquivos(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome)
    if (statSync(full).isDirectory()) out.push(...listarArquivos(full))
    else if (EXTS.some((e) => full.endsWith(e))) out.push(full)
  }
  return out
}

describe("escopo da barra de navegação inferior", () => {
  const consumidores = listarArquivos(SRC)
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .filter((f) => !f.endsWith("features/nav/components/BottomNav.tsx"))
    .filter((f) => /\bBottomNav\b/.test(readFileSync(f, "utf8")))
    .map((f) => relative(SRC, f).replaceAll("\\", "/"))

  it("só o layout do dashboard monta a barra", () => {
    expect(consumidores.sort()).toEqual(AUTORIZADOS)
  })

  it("nem a landing nem /demo referenciam a barra", () => {
    const publicos = consumidores.filter(
      (f) => f === "app/page.tsx" || f.startsWith("app/demo/") || f.startsWith("features/demo/"),
    )
    expect(publicos).toEqual([])
  })
})
