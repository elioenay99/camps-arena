import type { MetadataRoute } from "next";

// Cores da marca (tema padrão Dracula) — espelham os tokens do globals.css.
const DRACULA_BG = "#282a36";

/**
 * Web App Manifest (Next 16 injeta `<link rel="manifest">` automaticamente).
 * Habilita "Adicionar à tela inicial" no celular — uso majoritário do Goliseu.
 * Ícones same-origin (cobertos por `img-src 'self'` da CSP); `manifest-src` cai
 * no `default-src 'self'`. Sem service worker/offline nesta etapa.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Goliseu",
    short_name: "Goliseu",
    description: "Torneios de clubes com placar ao vivo, entre amigos.",
    start_url: "/",
    display: "standalone",
    lang: "pt-BR",
    dir: "ltr",
    background_color: DRACULA_BG,
    theme_color: DRACULA_BG,
    categories: ["sports"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
