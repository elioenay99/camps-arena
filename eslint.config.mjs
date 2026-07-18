import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Isolamento da subárvore /demo (modo público de demonstração): a árvore NUNCA
  // importa em RUNTIME actions, supabase, fetchers de /data, componentes
  // *Connected ou o subsistema Live*. Type-imports são apagados na compilação
  // (client-safe) → permitidos via allowTypeImports. Backstop: o teste de grafo
  // em src/features/demo/isolamento.test.ts pega reexport transitivo.
  {
    files: ["src/app/demo/**/*.{ts,tsx}", "src/features/demo/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/actions", "@/actions/*"],
              message:
                "A demonstração é isolada: não importe Server Actions (arrasta o bundle 'use server').",
            },
            {
              group: ["@/lib/supabase", "@/lib/supabase/*"],
              allowTypeImports: true,
              message:
                "A demonstração é 100% client/offline: não importe supabase em runtime (só `import type`).",
            },
            {
              group: ["@/features/*/data/*"],
              allowTypeImports: true,
              message:
                "A demonstração não usa fetchers de /data em runtime (só `import type` dos shapes).",
            },
            {
              group: ["**/*Connected"],
              message:
                "Componentes *Connected acoplam action/supabase — reconstrua no namespace demo.",
            },
            {
              group: ["**/Live*", "@/features/match/components/LiveMatchesProvider"],
              message:
                "O subsistema Live* usa Realtime/supabase — proibido na demonstração.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
