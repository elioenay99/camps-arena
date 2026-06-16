import { env } from "@/lib/env"
import {
  CopyInviteLinkButton,
  RegenerateInviteButton,
} from "@/features/tournament/components/InviteControls"

/**
 * Gestão do link de convite — renderizada SÓ para o dono de torneio
 * não-encerrado (a página gateia; a RLS de tournament_invites garante que o
 * código nem chega a outro usuário). `code` nulo = torneio legado sem convite
 * ou falha complementar na criação → oferece gerar o primeiro.
 */
export function InviteSection({
  tournamentId,
  code,
}: {
  tournamentId: string
  code: string | null
}) {
  const url = code ? `${env.NEXT_PUBLIC_SITE_URL}/convite/${code}` : null

  return (
    <section aria-labelledby="convite-titulo" className="flex flex-col gap-4">
      <h2 id="convite-titulo" className="text-lg font-semibold">
        Convite
      </h2>

      {url ? (
        <div className="flex flex-col gap-3 rounded-lg border px-4 py-3">
          <p className="text-muted-foreground text-sm">
            Quem abrir este link (logado) pode entrar no torneio. Gerar um novo
            link invalida o atual.
          </p>
          <p className="bg-muted min-w-0 truncate rounded-md px-3 py-2 font-mono text-sm">
            {url}
          </p>
          {/* gap-x-6: >=24px de folga ao redor do alvo de ação irreversível
              (gerar novo link) — meta de toque mobile. */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <CopyInviteLinkButton url={url} />
            <RegenerateInviteButton tournamentId={tournamentId} temConvite />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed px-4 py-3">
          <p className="text-muted-foreground text-sm">
            Este torneio ainda não tem link de convite.
          </p>
          <div>
            <RegenerateInviteButton tournamentId={tournamentId} temConvite={false} />
          </div>
        </div>
      )}
    </section>
  )
}
