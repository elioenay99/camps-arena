import { env } from "@/lib/env"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type { VagaDoTorneio } from "@/features/tournament/data/getVagasDoTorneio"
import {
  AssumirVagaButton,
  CopyVagaLinkButton,
  DesistirDaVagaButton,
  ExpulsarTecnicoButton,
  RegenerarConviteVagaButton,
} from "@/features/tournament/components/SlotInviteButtons"

/**
 * Vagas (clubes) de um torneio COMPETITIVO — RSC puro. Cada vaga é um CLUBE
 * (escudo + nome) com o técnico atual como detalhe ("téc. Fulano" /
 * "vaga aberta"). Ações por papel:
 * - DONO: por vaga, copia/gera o link do convite (segredo SÓ dele), e
 *   expulsa o técnico (vaga ocupada) OU assume o clube para si (vaga vazia).
 * - TÉCNICO da própria vaga: "desistir do clube".
 * - Visitante: só vê a lista.
 *
 * `codigos` (mapa slot_id → code) chega APENAS para o dono (a page gateia o
 * fetcher e só passa quando `ehDono`): os links de convite nunca são
 * renderizados para quem não é dono — defesa em profundidade com a RLS de
 * slot_invites. Torneio encerrado esconde as ações de troca (a RLS rejeita).
 */
export function VagasSection({
  vagas,
  userId,
  ehDono,
  tournamentId,
  torneioEncerrado,
  codigos,
}: {
  vagas: VagaDoTorneio[]
  userId: string
  ehDono: boolean
  tournamentId: string
  torneioEncerrado: boolean
  /** slot_id → code (só presente para o dono). */
  codigos?: Map<string, string>
}) {
  return (
    <section aria-labelledby="vagas-titulo" className="flex flex-col gap-4">
      <h2 id="vagas-titulo" className="font-display text-lg font-bold tracking-tight">
        Vagas
      </h2>

      {vagas.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          Este torneio ainda não tem clubes definidos.
        </p>
      ) : (
        <ul className="grid list-none gap-2 p-0">
          {vagas.map((vaga) => {
            const souTecnico = vaga.tecnico?.id === userId
            const code = codigos?.get(vaga.id) ?? null
            const url = code ? `${env.NEXT_PUBLIC_SITE_URL}/convite/${code}` : null
            return (
              <li
                key={vaga.id}
                className="flex flex-col gap-3 rounded-lg border px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamCrest nome={vaga.clube} escudoUrl={vaga.escudoUrl} size={28} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{vaga.clube}</span>
                      {/* Modo por-nome: o rótulo é o competidor — sem linha de
                          técnico ("téc."/"vaga aberta"). */}
                      {vaga.porNome ? null : vaga.tecnico ? (
                        <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                          <UserAvatar
                            nome={vaga.tecnico.nome}
                            avatarUrl={vaga.tecnico.avatar}
                            size={16}
                          />
                          <span className="truncate">
                            {`téc. ${vaga.tecnico.nome?.trim() || "Sem nome"}`}
                            {souTecnico ? " (você)" : ""}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground truncate text-xs">
                          vaga aberta
                        </span>
                      )}
                    </span>
                  </span>

                  {/* Técnico da própria vaga: desistir (qualquer status
                      não-encerrado). */}
                  {souTecnico && !torneioEncerrado ? (
                    <DesistirDaVagaButton tournamentId={tournamentId} />
                  ) : null}
                </div>

                {/* Console do dono por vaga: convite + troca de técnico. Só
                    renderizado para o dono — o code é segredo dele. Modo
                    por-nome NÃO tem convite/técnico: sem console. */}
                {ehDono && !torneioEncerrado && !vaga.porNome ? (
                  <div className="flex flex-col gap-2 border-t pt-3">
                    {url ? (
                      <p className="bg-muted min-w-0 truncate rounded-md px-3 py-1.5 font-mono text-xs">
                        {url}
                      </p>
                    ) : null}
                    {/* gap-x-6: >=24px entre alvos de ação irreversível
                        (regenerar/expulsar/assumir) — meta de toque mobile. */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {url ? <CopyVagaLinkButton url={url} /> : null}
                      <RegenerarConviteVagaButton
                        slotId={vaga.id}
                        temConvite={Boolean(code)}
                      />
                      {vaga.tecnico ? (
                        <ExpulsarTecnicoButton slotId={vaga.id} />
                      ) : (
                        <AssumirVagaButton slotId={vaga.id} />
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
