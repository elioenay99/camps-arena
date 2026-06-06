import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcceptInviteForm } from "@/features/tournament/components/AcceptInviteForm";
import { codigoConviteSchema } from "@/schema/participantSchema";

// Título genérico de propósito: o título do torneio só aparece no corpo, para
// quem TEM o código — metadata vaza em preview de link/history sem custo.
export const metadata: Metadata = {
  title: "Convite · Arena",
};

const LABEL_INVALIDO =
  "Convite inválido ou expirado. Peça um novo link a quem organizou o torneio.";

/**
 * Página PÚBLICA do convite (o código na URL é a credencial). Deslogado:
 * CTAs de login/cadastro com retorno para cá (`redirectTo` sanitizado pelas
 * actions). Logado: preview via `info_convite` (security definer — o torneio
 * pode ser privado e invisível até o aceite) + aceite explícito.
 */
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;

  // Lixo de URL nem chega ao banco; mensagem idêntica à de código inexistente
  // (sem oráculo de formato).
  const codigoValido = codigoConviteSchema.safeParse(codigo);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let conteudo: React.ReactNode;

  if (!codigoValido.success) {
    conteudo = <AvisoInvalido />;
  } else if (!user) {
    const retorno = encodeURIComponent(`/convite/${codigoValido.data}`);
    conteudo = (
      <div className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          Entre na sua conta (ou crie uma) para ver o convite e participar do
          torneio.
        </p>
        <Button asChild>
          <Link href={`/login?redirectTo=${retorno}`}>Entrar</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/cadastro?redirectTo=${retorno}`}>Criar conta</Link>
        </Button>
      </div>
    );
  } else {
    const { data, error } = await supabase.rpc("info_convite", {
      codigo: codigoValido.data,
    });
    if (error) {
      throw new Error(`Falha ao carregar o convite: ${error.message}`);
    }
    const info = data?.[0] ?? null;

    if (!info) {
      conteudo = <AvisoInvalido />;
    } else if (info.ja_participa) {
      conteudo = (
        <div className="grid gap-4">
          <p className="text-sm" role="status">
            {`Você já participa de "${info.titulo.trim() || "Torneio"}".`}
          </p>
          <Button asChild>
            <Link href={`/dashboard/torneios/${info.tournament_id}`}>
              Abrir o torneio
            </Link>
          </Button>
        </div>
      );
    } else if (info.status === "encerrado") {
      conteudo = (
        <p className="text-muted-foreground text-sm" role="status">
          {`O torneio "${info.titulo.trim() || "Torneio"}" está encerrado e não aceita novos participantes.`}
        </p>
      );
    } else if (info.formato !== "avulso" && info.status !== "rascunho") {
      // Formato gerado (liga/mata-mata) iniciado: tabela/chave já geradas —
      // quem entrasse agora ficaria sem partidas. A função aceitar_convite
      // rejeita de qualquer forma; explicar AQUI evita o clique fadado ao erro.
      conteudo = (
        <p className="text-muted-foreground text-sm" role="status">
          {`O torneio "${info.titulo.trim() || "Torneio"}" já foi iniciado e não aceita novos participantes.`}
        </p>
      );
    } else {
      conteudo = (
        <div className="grid gap-4">
          <p className="text-sm">
            {`Você foi convidado para participar de "${info.titulo.trim() || "Torneio"}".`}
          </p>
          <AcceptInviteForm codigo={codigoValido.data} />
        </div>
      );
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Convite</CardTitle>
          <CardDescription>
            Convite para participar de um torneio no Arena.
          </CardDescription>
        </CardHeader>
        <CardContent>{conteudo}</CardContent>
      </Card>
    </main>
  );
}

function AvisoInvalido() {
  return (
    <p className="text-muted-foreground text-sm" role="status">
      {LABEL_INVALIDO}
    </p>
  );
}
