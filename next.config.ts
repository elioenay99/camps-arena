import type { NextConfig } from "next";

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
