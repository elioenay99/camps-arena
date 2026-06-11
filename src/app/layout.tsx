import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

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
          <Toaster richColors position="top-center" />
        </ThemeProvider>
        {/* Vercel Analytics + Web Vitals: injetam o script via createElement no
            bundle confiável (autorizado por strict-dynamic) e batem em endpoints
            same-origin; no-op fora do Vercel. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
