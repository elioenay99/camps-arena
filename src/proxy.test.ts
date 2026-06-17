import { describe, expect, it } from "vitest"

import { config } from "@/proxy"

// O matcher é a FRONTEIRA que decide quais rotas passam pelo auth-gate
// (updateSession → redirect de não-logado em rotas protegidas) + CSP por nonce.
// Uma edição errada no regex pode desviar uma rota protegida sem nada quebrar
// visivelmente (a página renderiza, só perde o gate). Este teste trava isso
// compilando o matcher REAL do proxy e checando MATCH (passa pelo middleware)
// vs SKIP (isento).
const re = new RegExp(`^${config.matcher[0]}$`)
const passa = (pathname: string) => re.test(pathname)

describe("proxy matcher", () => {
  it("rotas protegidas e públicas passam pelo middleware (auth-gate + CSP)", () => {
    for (const p of [
      "/dashboard",
      "/dashboard/torneios/1",
      "/atualizar-senha",
      "/convite/ABCD1234",
      "/login",
      "/cadastro",
      "/",
    ]) {
      expect(passa(p), `${p} deveria passar`).toBe(true)
    }
  })

  it("cards OG, túnel do Sentry, SW/offline e assets são isentos (skip)", () => {
    for (const p of [
      "/opengraph-image",
      "/twitter-image",
      "/opengraph-image/foo",
      "/twitter-image/bar",
      "/sentry-tunnel",
      // PWA Fase 2: o SW e a página offline não passam pelo proxy (nonce/sessão).
      "/sw.js",
      "/offline.html",
      "/_next/static/chunk.js",
      "/_next/image",
      "/favicon.ico",
      "/logo.png",
      "/escudo.svg",
    ]) {
      expect(passa(p), `${p} deveria ser isento`).toBe(false)
    }
  })

  it("boundary: rota que só COMPARTILHA prefixo com uma isenta segue protegida", () => {
    // Sem o `(?:$|/)` e o ponto escapado, estas vazariam do auth-gate/CSP.
    for (const p of [
      "/opengraph-imagery",
      "/twitter-imageboard",
      "/sentry-tunnelish",
      // sw\.js / offline\.html com o ponto ESCAPADO: estas não podem ser isentas.
      "/swag",
      "/offline-foo",
      "/swxjs",
      "/sw-js",
      "/offlineXhtml",
      "/offline_html",
    ]) {
      expect(passa(p), `${p} NÃO deveria ser isento`).toBe(true)
    }
  })
})
