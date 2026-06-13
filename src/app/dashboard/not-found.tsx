import { Compass } from "lucide-react";
import Link from "next/link";

import { BoundaryCard } from "@/components/boundary-card";
import { Button } from "@/components/ui/button";

/**
 * notFound() do segmento /dashboard (ex.: torneio inexistente ou privado de
 * terceiro). Sem este arquivo o usuário cairia no 404 cru do Next, fora do
 * shell visual do app.
 */
export default function DashboardNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Sem marca: o header persistente do layout do segmento já a exibe. */}
      <BoundaryCard
        tone="neutro"
        Icon={Compass}
        titulo="Página não encontrada"
        descricao="Este conteúdo não existe ou você não tem acesso a ele."
      >
        <Button asChild>
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </BoundaryCard>
    </main>
  );
}
