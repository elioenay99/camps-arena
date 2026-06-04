import type { NextConfig } from "next";

// Fail-fast: valida as variáveis de ambiente no início do build/dev (o Next
// carrega os .env* ANTES de avaliar esta config), em vez de falhar no meio
// do prerender ou na primeira request.
import "./src/lib/env";

const nextConfig: NextConfig = {
  images: {
    // Escudos de clube servidos pelo CDN da API-Football.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/teams/**",
      },
    ],
  },
};

export default nextConfig;
