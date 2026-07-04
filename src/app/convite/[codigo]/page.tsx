import type { Metadata } from "next";
import Link from "next/link";
import {
  CircleCheck,
  Flag,
  Lock,
  ShieldAlert,
  Ticket,
  Trophy,
  UserX,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AcceptInviteForm } from "@/features/tournament/components/AcceptInviteForm";
import { AcceptSlotInviteForm } from "@/features/tournament/components/AcceptSlotInviteForm";
import { codigoConviteSchema } from "@/schema/participantSchema";
import {
  ConviteShell,
  EstadoBloqueio,
  HeroClube,
  HeroIcone,
  PainelConvite,
} from "./convite-ui";

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
      <PainelConvite>
        <HeroIcone icon={Ticket} />
        <p className="text-muted-foreground text-sm">
          Entre na sua conta (ou crie uma) para ver o convite e participar do
          torneio.
        </p>
        <div className="grid gap-2">
          <Button asChild>
            <Link href={`/login?redirectTo=${retorno}`}>Entrar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/cadastro?redirectTo=${retorno}`}>Criar conta</Link>
          </Button>
        </div>
      </PainelConvite>
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
    const titulo = info?.titulo?.trim() || "Torneio";

    if (!info) {
      conteudo = <AvisoInvalido />;
    } else if (info.ja_participa) {
      conteudo = (
        <PainelConvite>
          <HeroIcone icon={CircleCheck} />
          <p className="text-sm" role="status">
            {`Você já participa de "${titulo}".`}
          </p>
          <Button asChild>
            <Link href={`/dashboard/torneios/${info.tournament_id}`}>
              Abrir o torneio
            </Link>
          </Button>
        </PainelConvite>
      );
    } else if (info.status === "encerrado") {
      conteudo = (
        <EstadoBloqueio icon={Flag}>
          {`O torneio "${titulo}" está encerrado e não aceita novos participantes.`}
        </EstadoBloqueio>
      );
    } else if (info.formato !== "avulso" && info.status !== "rascunho") {
      // Formato gerado (liga/mata-mata) iniciado: tabela/chave já geradas —
      // quem entrasse agora ficaria sem partidas. A função aceitar_convite
      // rejeita de qualquer forma; explicar AQUI evita o clique fadado ao erro.
      conteudo = (
        <EstadoBloqueio icon={Lock}>
          {`O torneio "${titulo}" já foi iniciado e não aceita novos participantes.`}
        </EstadoBloqueio>
      );
    } else {
      conteudo = (
        <PainelConvite>
          <HeroIcone icon={Trophy} />
          <div className="flex flex-col items-center gap-1">
            <span className="font-display text-xl font-bold tracking-tight break-words">
              {titulo}
            </span>
            <p className="text-muted-foreground text-sm">
              Você foi convidado para participar deste torneio.
            </p>
          </div>
          <AcceptInviteForm codigo={codigoValido.data} />
        </PainelConvite>
      );
    }
  }

  return <ConviteShell>{conteudo}</ConviteShell>;
}

function AvisoInvalido() {
  return <EstadoBloqueio icon={ShieldAlert}>{LABEL_INVALIDO}</EstadoBloqueio>;
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
      <EstadoBloqueio icon={Flag}>
        {`O torneio "${tituloTorneio}" está encerrado e não aceita novos técnicos.`}
      </EstadoBloqueio>
    );
  }
  if (info.ja_tem_vaga) {
    return (
      <PainelConvite>
        <HeroIcone icon={CircleCheck} />
        <p className="text-sm" role="status">
          {`Você já comanda um clube em "${tituloTorneio}".`}
        </p>
        <Button asChild>
          <Link href={`/dashboard/torneios/${info.tournament_id}`}>
            Abrir o torneio
          </Link>
        </Button>
      </PainelConvite>
    );
  }
  if (info.vaga_ocupada) {
    return (
      <EstadoBloqueio icon={UserX}>
        {`O clube ${clube} já tem um técnico. Peça outro convite a quem organiza "${tituloTorneio}".`}
      </EstadoBloqueio>
    );
  }

  return (
    <PainelConvite>
      <HeroClube clube={clube} torneio={tituloTorneio} escudoUrl={info.escudo_url} />
      <p className="text-sm">
        {`Você foi convidado para comandar ${clube} como técnico.`}
      </p>
      <AcceptSlotInviteForm codigo={codigo} />
    </PainelConvite>
  );
}
