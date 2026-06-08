import type { NextConfig } from "next";

// Fail-fast: valida as variáveis de ambiente no início do build/dev (o Next
// carrega os .env* ANTES de avaliar esta config), em vez de falhar no meio
// do prerender ou na primeira request.
import "./src/lib/env";

const nextConfig: NextConfig = {
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
