import { defineConfig } from "vitest/config"

export default defineConfig({
  // Resolução nativa dos paths do tsconfig (@/* → ./src/*).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
})
