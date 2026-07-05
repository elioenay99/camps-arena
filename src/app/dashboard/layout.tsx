import Link from "next/link";

import { logout } from "@/actions/auth";
import { ModeToggle } from "@/components/mode-toggle";
import { StadiumBackdrop } from "@/components/stadium-backdrop";
import { Button } from "@/components/ui/button";
import { NavLinks, type NavLink } from "@/features/nav/components/NavLinks";
import { UserAvatar } from "@/features/profile/components/UserAvatar";
import { getPerfil } from "@/features/profile/data/getPerfil";

const LINKS: NavLink[] = [
  // "/dashboard" com igualdade exata — por prefixo ativaria em todo o segmento.
  { href: "/dashboard", rotulo: "Painel", exato: true },
  // "Torneios" cobre o índice e as sub-rotas (novo, página do torneio) por
  // prefixo — o antigo item "Novo torneio" virou o botão "Criar torneio" do
  // índice (dois itens do nav ativos ao mesmo tempo confundem).
  { href: "/dashboard/torneios", rotulo: "Torneios" },
  // "Pirâmides" cobre o índice das pirâmides e as sub-rotas (nova, temporada,
  // página do competidor) por prefixo. A rota /dashboard/ligas não muda.
  { href: "/dashboard/ligas", rotulo: "Pirâmides" },
  // "Copas" cobre o índice, nova, página da copa e da edição por prefixo.
  { href: "/dashboard/copas", rotulo: "Copas" },
  // "Explorar" = vitrine pública das competições listadas (add-vitrine-publica-e-
  // compartilhar). Ativo por prefixo.
  { href: "/dashboard/explorar", rotulo: "Explorar" },
  { href: "/dashboard/partidas/nova", rotulo: "Nova partida" },
];

/**
 * Shell autenticado: header persistente em TODAS as páginas do segmento.
 * As páginas (e os boundaries de loading/erro/404) não renderizam marca nem
 * logout próprios — fariam a marca duplicar, já que renderizam DENTRO daqui.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const perfil = await getPerfil();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StadiumBackdrop />
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          <Link
            href="/dashboard"
            // Sem prefetch: o header aparece em TODA página do dashboard; a marca
            // e o avatar prefetchariam /dashboard e /dashboard/conta (rotas RSC)
            // em cima da rajada das listas — a borda da Vercel descarta o excesso
            // (503). O clique segue navegando. Ver change add-header-prefetch-hardening.
            prefetch={false}
            className="font-display text-base font-bold tracking-[0.25em] text-foreground"
          >
            GOLISEU<span className="text-primary">.</span>
          </Link>

          <NavLinks links={LINKS} />

          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <Link
              href="/dashboard/conta"
              aria-label="Sua conta"
              prefetch={false}
              className="flex size-11 items-center justify-center rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <UserAvatar
                nome={perfil?.nome ?? null}
                avatarUrl={perfil?.avatar ?? null}
                size={32}
              />
            </Link>
            <form action={logout}>
              {/* Sair = ação irreversível (encerra a sessão): alvo de toque de
                  40px no mobile (a base size="sm" tem h-7), com padding extra. */}
              <Button
                variant="outline"
                size="sm"
                type="submit"
                className="min-h-10 px-4"
              >
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
