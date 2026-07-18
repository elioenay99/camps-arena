import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

// Guard de isolamento da demonstração (backstop do ESLint no-restricted-imports).
// Faz o parse do grafo de imports estáticos a partir de src/app/demo +
// src/features/demo, DESCARTANDO imports type-only (apagados na compilação), e
// falha se o fecho transitivo de RUNTIME alcançar src/actions, src/lib/supabase
// ou qualquer src/features/*/data. Trata re-exports e import() dinâmico; resolve
// o alias @/ → src/.

const SRC = resolve(__dirname, "../../")
const ROOTS = [join(SRC, "app/demo"), join(SRC, "features/demo")]
const EXTS = [".ts", ".tsx", ".js", ".jsx"]

const PROIBIDOS = [
  { rotulo: "src/actions", casa: (p: string) => p.startsWith("actions/") },
  { rotulo: "src/lib/supabase", casa: (p: string) => p.startsWith("lib/supabase/") || p === "lib/supabase" },
  {
    rotulo: "src/features/*/data",
    casa: (p: string) => /^features\/[^/]+\/data(\/|$)/.test(p),
  },
]

function listarArquivos(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome)
    if (statSync(full).isDirectory()) {
      out.push(...listarArquivos(full))
    } else if (EXTS.some((e) => full.endsWith(e))) {
      out.push(full)
    }
  }
  return out
}

/** Resolve um specifier local para um caminho de arquivo (ou null se externo/irresolúvel). */
function resolverModulo(spec: string, deArquivo: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2))
  else if (spec.startsWith(".")) base = resolve(dirname(deArquivo), spec)
  else return null // bare import (node_modules) — não seguimos nem banimos

  const candidatos = [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => join(base, "index" + e)),
  ]
  for (const c of candidatos) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** Extrai os specifiers de RUNTIME de um arquivo (pula type-only). */
function importsDeRuntime(arquivo: string): string[] {
  const fonte = ts.createSourceFile(
    arquivo,
    readFileSync(arquivo, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const specs: string[] = []

  const ehImportTypeOnly = (node: ts.ImportDeclaration): boolean => {
    const clause = node.importClause
    if (!clause) return false // side-effect import (runtime)
    if (clause.isTypeOnly) return true // import type ...
    // import { type a, type b } (todos type) → elidido
    const nb = clause.namedBindings
    if (nb && ts.isNamedImports(nb)) {
      if (nb.elements.length > 0 && nb.elements.every((el) => el.isTypeOnly)) {
        // ...mas se também há default/namespace binding, é runtime
        return !clause.name
      }
    }
    return false
  }

  const ehExportTypeOnly = (node: ts.ExportDeclaration): boolean => {
    if (node.isTypeOnly) return true
    const ec = node.exportClause
    if (ec && ts.isNamedExports(ec)) {
      return ec.elements.length > 0 && ec.elements.every((el) => el.isTypeOnly)
    }
    return false
  }

  const visitar = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!ehImportTypeOnly(node)) specs.push(node.moduleSpecifier.text)
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!ehExportTypeOnly(node)) specs.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specs.push((node.arguments[0] as ts.StringLiteral).text)
    }
    ts.forEachChild(node, visitar)
  }
  visitar(fonte)
  return specs
}

describe("isolamento da demonstração (grafo de imports de runtime)", () => {
  it("não alcança src/actions, src/lib/supabase nem src/features/*/data", () => {
    const entradas = ROOTS.flatMap(listarArquivos).filter(
      (f) => !/\.(test|spec)\.[jt]sx?$/.test(f)
    )
    expect(entradas.length).toBeGreaterThan(0)

    const visitados = new Set<string>()
    const fila = [...entradas]
    const violacoes: string[] = []

    while (fila.length > 0) {
      const arquivo = fila.pop() as string
      if (visitados.has(arquivo)) continue
      visitados.add(arquivo)

      for (const spec of importsDeRuntime(arquivo)) {
        const alvo = resolverModulo(spec, arquivo)
        if (!alvo) continue
        const rel = relative(SRC, alvo).replaceAll("\\", "/")
        const proibido = PROIBIDOS.find((p) => p.casa(rel))
        if (proibido) {
          violacoes.push(
            `${relative(SRC, arquivo)} → "${spec}" (${rel}) [${proibido.rotulo}]`
          )
          continue // não segue dentro do proibido
        }
        if (!visitados.has(alvo)) fila.push(alvo)
      }
    }

    expect(violacoes, `Vazamentos de runtime:\n${violacoes.join("\n")}`).toEqual([])
  })
})
