import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * notFound() do segmento /dashboard (ex.: torneio inexistente ou privado de
 * terceiro). Sem este arquivo o usuário cairia no 404 cru do Next, fora do
 * shell visual do app.
 */
export default function DashboardNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.3em] text-muted-foreground">
          ARENA
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Página não encontrada</CardTitle>
          <CardDescription>
            Este conteúdo não existe ou você não tem acesso a ele.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard">Voltar ao painel</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
