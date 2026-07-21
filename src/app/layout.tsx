import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

import { AnalyticsGate } from "@/components/analytics-gate";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";

// O nonce da CSP é per-request → o app renderiza dinamicamente (página estática
// nasceria sem nonce e teria os scripts do framework bloqueados pelo CSP).
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display da identidade "Estádio à noite": marca, títulos e placares
// (scoreboard). O corpo permanece em Geist — legibilidade em forms/tabelas.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const DESCRICAO =
  "Gestão de torneios e partidas — placar ao vivo entre participantes.";

export const metadata: Metadata = {
  // URL canônica do site: base para URLs absolutas de metadados/OG.
  // O default de dev (`http://localhost:3000`) vive no schema de `env`.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: "Goliseu",
  description: DESCRICAO,
  // og:image/twitter:image vêm dos arquivos `opengraph-image`/`twitter-image`
  // da raiz (card estático da marca) — herdados por todas as rotas.
  openGraph: {
    type: "website",
    siteName: "Goliseu",
    title: "Goliseu",
    description: DESCRICAO,
    locale: "pt_BR",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Goliseu",
    description: DESCRICAO,
  },
  // PWA/iOS: nome curto na tela inicial + barra de status integrada ao app.
  appleWebApp: {
    capable: true,
    title: "Goliseu",
    statusBarStyle: "black-translucent",
  },
};

// A cor do chrome do navegador acompanha o tema: slate Dracula no escuro
// (padrão), branco-quente Canarinho no claro.
export const viewport: Viewport = {
  // Contrapartida obrigatória do `statusBarStyle: "black-translucent"` acima: sem
  // `cover`, todo `env(safe-area-inset-*)` resolve 0 — o app invadiria a área do
  // notch sem ter como reservar espaço. Consumido pelos headers sticky e pelo body.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#282a36" },
    { media: "(prefers-color-scheme: light)", color: "#fffdf2" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // next-themes injeta um <script> inline anti-flash que o nonce automático do
  // Next não cobre — repassamos o nonce do request para ele emitir com o nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          {/* Ancorado embaixo: no topo o toast cobria o header inteiro (marca,
              menu, tema, conta) no mobile. A subárvore autenticada PASSOU a ter
              barra fixa no rodapé (change mobile-nav-densidade), então há
              disputa de espaço: `globals.css` levanta o toast acima da barra —
              só nas rotas que a têm, via `body:has(#nav-inferior)`. */}
          <Toaster richColors position="bottom-center" />
        </ThemeProvider>
        {/* Vercel Analytics + Web Vitals: injetam o script via createElement no
            bundle confiável (autorizado por strict-dynamic) e batem em endpoints
            same-origin; no-op fora do Vercel. Gated por rota: suprimidos na
            subárvore pública /demo (sem integração externa). */}
        <AnalyticsGate />
        {/* Registra o service worker (offline) só em produção. */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
