import Link from "next/link";

import { logout } from "@/actions/auth";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { NavLinks, type NavLink } from "@/features/nav/components/NavLinks";

const LINKS: NavLink[] = [
  // "/dashboard" com igualdade exata — por prefixo ativaria em todo o segmento.
  { href: "/dashboard", rotulo: "Painel", exato: true },
  { href: "/dashboard/torneios/novo", rotulo: "Novo torneio" },
  { href: "/dashboard/partidas/nova", rotulo: "Nova partida" },
];

/**
 * Shell autenticado: header persistente em TODAS as páginas do segmento.
 * As páginas (e os boundaries de loading/erro/404) não renderizam marca nem
 * logout próprios — fariam a marca duplicar, já que renderizam DENTRO daqui.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-[0.3em] text-muted-foreground"
          >
            ARENA
          </Link>

          <NavLinks links={LINKS} />

          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
            <form action={logout}>
              <Button variant="outline" size="sm" type="submit">
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
