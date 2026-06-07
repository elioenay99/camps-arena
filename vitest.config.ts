import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  // Resolução nativa dos paths do tsconfig (@/* → ./src/*). `server-only` é um
  // guard de runtime do Next (lança fora do servidor) — em teste é no-op via
  // alias para um stub vazio, evitando vi.mock("server-only") em cada arquivo.
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test/empty-module.ts", import.meta.url)
      ),
    },
  },
  test: {
    // Default node (actions/schema). Testes de componente usam o pragma
    // `// @vitest-environment jsdom` no topo do arquivo.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // `src/lib/env.ts` valida no load do módulo — dummies mantêm verdes os
    // testes que o importam transitivamente (vitest não carrega .env* do Next).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-anon-de-teste",
    },
  },
})
