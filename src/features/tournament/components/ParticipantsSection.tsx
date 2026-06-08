import type { ParticipanteDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio"
import {
  JoinOwnTournamentButton,
  LeaveTournamentButton,
  RemoveParticipantButton,
} from "@/features/tournament/components/ParticipantButtons"
import { UserAvatar } from "@/features/profile/components/UserAvatar"

/**
 * Lista de participantes confirmados (RSC) — EXCLUSIVA do formato AVULSO
 * (modelo clube-cêntrico: competitivos usam VagasSection). Ações por papel:
 * - a PRÓPRIA linha tem "Sair" (qualquer participante, dono incluso);
 * - as demais linhas têm "Remover" quando o usuário é o DONO;
 * - dono fora da lista vê "Participar" (reentrada / torneio legado), só com
 *   torneio não-encerrado (espelha a policy de INSERT).
 * O congelamento de lista do mata-mata MORREU com o escopo avulso (a chave
 * competitiva é entre vagas; participants não a sustenta mais).
 * Os botões são UX — a autorização real é action + RLS.
 */
export function ParticipantsSection({
  tournamentId,
  participantes,
  userId,
  ehDono,
  torneioEncerrado,
}: {
  tournamentId: string
  participantes: ParticipanteDoTorneio[]
  userId: string
  ehDono: boolean
  torneioEncerrado: boolean
}) {
  const souParticipante = participantes.some((p) => p.id === userId)

  return (
    <section aria-labelledby="participantes-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="participantes-titulo" className="text-lg font-semibold">
          Participantes
        </h2>
        {ehDono && !souParticipante && !torneioEncerrado ? (
          <JoinOwnTournamentButton tournamentId={tournamentId} />
        ) : null}
      </div>

      {participantes.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          Ainda não há participantes. Compartilhe o link de convite para chamar
          os jogadores.
        </p>
      ) : (
        <ul className="grid list-none gap-2 p-0">
          {participantes.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <UserAvatar nome={p.nome} avatarUrl={p.avatar} size={28} />
                <span className="min-w-0 truncate">
                  {p.nome?.trim() || "Sem nome"}
                  {p.id === userId ? (
                    <span className="text-muted-foreground"> (você)</span>
                  ) : null}
                </span>
              </span>
              {p.id === userId ? (
                <LeaveTournamentButton tournamentId={tournamentId} />
              ) : ehDono ? (
                <RemoveParticipantButton
                  tournamentId={tournamentId}
                  userId={p.id}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
