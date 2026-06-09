import type { NextConfig } from "next";

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
};

export default nextConfig;
