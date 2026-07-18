## 1. Proxy: pular refresh de sessão em `/demo`

- [ ] 1.1 Em `src/proxy.ts`, calcular `nonce`/`csp` uma vez (bloco existente) e detectar a
  demo com limite de segmento: `const ehDemo = pathname === "/demo" || pathname.startsWith("/demo/")`.
- [ ] 1.2 Quando `ehDemo`: montar a resposta direta espelhando `nextWithHeaders()` de
  `middleware.ts` — clonar `request.headers`, setar `x-nonce` + `content-security-policy`
  nos request headers internos, `NextResponse.next({ request: { headers } })`, e setar
  `content-security-policy` na resposta. Sem tocar o Supabase. Importar `NextResponse`.
- [ ] 1.3 Quando NÃO `ehDemo`: manter `await updateSession(...)` + CSP na resposta.
- [ ] 1.4 Matcher e `export const config` idênticos; comentar o PORQUÊ (demo dispensa refresh).

## 2. Copy dos perfis fictícios

- [ ] 2.1 `src/features/demo/store/perfil.ts` — `DESCRICAO_PERFIL.visitante` =
  "Explora competições e experimenta placares, sem ações de gestão";
  `DESCRICAO_PERFIL.tecnico` = "Experimenta placares e acompanha a visão de um técnico".
  Manter `gestor`/`admin`, `flagsDoPerfil` e as flags.

## 3. README honesto

- [ ] 3.1 `README.md` (seção "Demonstração") — afirmar que nem a árvore de componentes nem
  o middleware consultam o Supabase em `/demo`. Sem inventar números.

## 4. Testes de runtime do proxy

- [ ] 4.1 Cobertura de `proxy()` (novo `src/proxy.runtime.test.ts` ou no arquivo existente),
  mockando `@/lib/supabase/middleware` (spy em `updateSession`) e o que `@/lib/env` /
  `@/lib/security/csp` exigirem:
  - `/demo`, `/demo/torneios`, `/demo/ligas` → `updateSession` NÃO chamado; resposta com
    `content-security-policy`.
  - `/dashboard`, `/atualizar-senha` → `updateSession` chamado.
  - `/demonstration`, `/demo-extra` → `updateSession` chamado (sem bypass).
- [ ] 4.2 `src/proxy.test.ts` (regex do matcher) permanece intacto e passando.

## 5. Gates

- [ ] 5.1 `pnpm typecheck` verde.
- [ ] 5.2 `pnpm lint` verde.
- [ ] 5.3 `pnpm test` verde.
- [ ] 5.4 `pnpm build` verde.
