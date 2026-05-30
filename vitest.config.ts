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
  },
})
