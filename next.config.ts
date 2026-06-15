import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Fail-fast: valida as variáveis de ambiente no início do build/dev (o Next
// carrega os .env* ANTES de avaliar esta config), em vez de falhar no meio
// do prerender ou na primeira request.
import "./src/lib/env";

// Headers de segurança estáticos (não dependem de nonce) — em headers() cobrem
// TODAS as rotas, inclusive _next/static e imagens (que o matcher do proxy
// exclui). A CSP por nonce mora no proxy. HSTS só em produção (em dev sobre
// http://localhost os browsers ignoram, mas não emitimos por higiene).
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      // Escudos de clube servidos pelo CDN da API-Football.
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/teams/**",
      },
      // Fotos de perfil no bucket público do Supabase Storage.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    // Upload de avatar via Server Action (arquivo no FormData). O default é 1MB;
    // a foto é validada em ≤2MB na action, com folga aqui.
    serverActions: { bodySizeLimit: "3mb" },
  },
  // O card OG lê fonte (woff) e logo (svg) via `readFile(process.cwd()...)`. No
  // build atual as rotas saem `○ Static` (prerenderizadas — não herdam o
  // force-dynamic do layout). Isto é defesa em profundidade: se uma mudança
  // futura tornar a rota dinâmica (ex.: ler request), garante que os assets
  // entrem no bundle serverless (o trace pode não pegar readFile dinâmico).
  outputFileTracingIncludes: {
    "/opengraph-image": ["./src/features/og/fonts/**", "./src/app/icon.svg"],
    "/twitter-image": ["./src/features/og/fonts/**", "./src/app/icon.svg"],
    // Imagem da rodada (change add-compartilhar-rodada): rota DINÂMICA que lê as
    // fontes/logo via readFile(process.cwd()) (reusa carregarAssets do OG). Aqui
    // o include é OBRIGATÓRIO (não defesa em profundidade): a rota é dinâmica
    // (sessão/cookies) e o trace não pega o readFile — sem isto a geração quebra
    // com ENOENT em runtime no Vercel, apesar do build passar.
    "/dashboard/torneios/[id]/rodada/[rodada]/imagem": [
      "./src/features/og/fonts/**",
      "./src/app/icon.svg",
    ],
  },
};

// Envelopa com o Sentry: instrumentação + túnel same-origin (mantém a CSP) +
// upload de source maps. org/project/authToken vêm de ENV (não hardcoded — sem
// eles o upload é PULADO e o build passa; com placeholder falso, o upload
// quebraria). `import "./src/lib/env"` acima segue valendo (fail-fast).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // String FIXA (nunca `true`, que geraria path aleatório por deploy): o
  // browser POSTa same-origin → coberto por connect-src 'self' (CSP inalterada)
  // e dribla ad-blockers. O matcher do proxy exclui este path.
  tunnelRoute: "/sentry-tunnel",
  // Amplia o upload de source maps para cobrir os bundles client.
  widenClientFileUpload: true,
  // Silencioso fora do CI (logs de upload só quando relevante).
  silent: !process.env.CI,
});
