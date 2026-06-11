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
import { AcceptSlotInviteForm } from "@/features/tournament/components/AcceptSlotInviteForm";
import { TeamCrest } from "@/features/team/components/TeamCrest";
import { codigoConviteSchema } from "@/schema/participantSchema";

// Título genérico de propósito: o título do torneio só aparece no corpo, para
// quem TEM o código — metadata vaza em preview de link/history sem custo.
export const metadata: Metadata = {
  title: "Convite · Goliseu",
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

  // Convite de VAGA (torneio competitivo, modelo clube-cêntrico): só faz
  // sentido com código válido e sessão; tenta o RPC de vaga PRIMEIRO. Achou →
  // tela de assumir o CLUBE. Não achou (`null`) → cai no fluxo genérico
  // (avulso) na MESMA rota pública.
  const vaga =
    codigoValido.success && user
      ? await conteudoDeVaga(supabase, codigoValido.data)
      : null;

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
  } else if (vaga !== null) {
    conteudo = vaga;
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
            Convite para participar de um torneio no Goliseu.
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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Caminho do convite de VAGA (torneio competitivo). Tenta `info_convite_vaga`
 * (security definer — o torneio pode ser privado e invisível até o aceite):
 * - sem linha → `null` (não é convite de vaga; o caller cai no fluxo avulso);
 * - `vaga_ocupada` → o clube já tem técnico (peça outro link);
 * - `ja_tem_vaga` → você já comanda um clube neste torneio;
 * - `encerrado` → não aceita novos técnicos;
 * - caso contrário → tela de assumir o CLUBE (escudo + clube + torneio).
 */
async function conteudoDeVaga(
  supabase: SupabaseClient,
  codigo: string
): Promise<React.ReactNode | null> {
  const { data, error } = await supabase.rpc("info_convite_vaga", { codigo });
  if (error) {
    throw new Error(`Falha ao carregar o convite: ${error.message}`);
  }
  const info = data?.[0] ?? null;
  if (!info) {
    return null;
  }

  const tituloTorneio = info.titulo.trim() || "Torneio";
  const clube = info.clube.trim() || "Clube";

  if (info.status === "encerrado") {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        {`O torneio "${tituloTorneio}" está encerrado e não aceita novos técnicos.`}
      </p>
    );
  }
  if (info.ja_tem_vaga) {
    return (
      <div className="grid gap-4">
        <p className="text-sm" role="status">
          {`Você já comanda um clube em "${tituloTorneio}".`}
        </p>
        <Button asChild>
          <Link href={`/dashboard/torneios/${info.tournament_id}`}>
            Abrir o torneio
          </Link>
        </Button>
      </div>
    );
  }
  if (info.vaga_ocupada) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        {`O clube ${clube} já tem um técnico. Peça outro convite a quem organiza "${tituloTorneio}".`}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <TeamCrest nome={clube} escudoUrl={info.escudo_url} size={40} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{clube}</span>
          <span className="text-muted-foreground truncate text-xs">
            {`em "${tituloTorneio}"`}
          </span>
        </div>
      </div>
      <p className="text-sm">
        {`Você foi convidado para comandar ${clube} como técnico.`}
      </p>
      <AcceptSlotInviteForm codigo={codigo} />
    </div>
  );
}
