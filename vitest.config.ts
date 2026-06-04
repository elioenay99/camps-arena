import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  // Resolução nativa dos paths do tsconfig (@/* → ./src/*).
  resolve: { tsconfigPaths: true },
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
