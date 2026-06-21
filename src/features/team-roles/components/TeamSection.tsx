import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { RemoveMemberButton } from "@/features/team-roles/components/RemoveMemberButton"
import { TeamRoleBadge } from "@/features/team-roles/components/TeamRoleBadge"
import type { MembroEquipe } from "@/features/team-roles/data/getMembros"
import type { Escopo } from "@/schema/equipe"

/**
 * Lista a EQUIPE do campeonato (RSC): o dono (sinalizado à parte, sem linha de
 * membro) + admins/árbitros/moderadores nomeados. Cada linha mostra avatar,
 * nome e a pílula do papel; quem PODE gerir vê "Remover" nas linhas dos demais.
 *
 * O dono encabeça a lista com a coroa e nunca é removível (não há linha sua em
 * `*_members`; a action/RLS barraria de qualquer forma). A própria linha do
 * usuário também não traz "Remover" — sair é fluxo distinto (sairDaEquipe),
 * fora do escopo desta seção. Os botões são UX; a barreira real é action + RLS.
 */
export function TeamSection({
  escopo,
  alvoId,
  membros,
  userId,
  ehDono,
  podeGerir,
  dono,
}: {
  escopo: Escopo
  alvoId: string
  membros: MembroEquipe[]
  /** Id do usuário logado — esconde "Remover" na própria linha. */
  userId: string
  /** O usuário logado é o dono do campeonato? (controla a coroa "(você)".) */
  ehDono: boolean
  /** O usuário logado pode gerir? (controla a exibição de "Remover".) */
  podeGerir: boolean
  /** Identidade do dono para encabeçar a lista (sem linha em `*_members`). */
  dono: { userId: string; nome: string | null; avatar: string | null } | null
}) {
  // O dono pode também ter uma linha em `*_members` (legado/edge) — evita
  // duplicar: a linha dele sai do array, ele entra só pelo cabeçalho coroado.
  const semDono = dono
    ? membros.filter((m) => m.userId !== dono.userId)
    : membros

  const vazio = !dono && semDono.length === 0

  // Quem PODE ver "Remover" numa linha: precisa de capacidade (`podeGerir`), não
  // pode ser a própria linha (sair é outro fluxo) e — quando o alvo é ADMIN —
  // só o DONO remove. A RLS nega admin-remove-admin a não-dono; esconder o botão
  // evita o beco sem saída (clicar, confirmar e tomar erro). O dono remove
  // qualquer papel; admin não-dono remove só não-admins (árbitro/moderador).
  function podeRemover(m: MembroEquipe): boolean {
    if (!podeGerir || m.userId === userId) return false
    if (m.papel === "admin" && !ehDono) return false
    return true
  }

  return (
    <section aria-labelledby="equipe-titulo" className="flex flex-col gap-4">
      <h2 id="equipe-titulo" className="text-lg font-semibold">
        Equipe
      </h2>

      {vazio ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
          Ainda não há ninguém na equipe. Convide árbitros e moderadores pelo
          link ou nomeie alguém pela busca abaixo.
        </p>
      ) : (
        <ul className="grid list-none gap-2 p-0">
          {dono ? (
            <li className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <UserAvatar nome={dono.nome} avatarUrl={dono.avatar} size={28} />
                <span className="min-w-0 truncate">
                  {dono.nome?.trim() || "Sem nome"}
                  {ehDono ? (
                    <span className="text-muted-foreground"> (você)</span>
                  ) : null}
                </span>
              </span>
              <TeamRoleBadge papel="dono" />
            </li>
          ) : null}

          {semDono.map((m) => {
            const nome = m.nome?.trim() || "Sem nome"
            const ehProprio = m.userId === userId
            return (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <UserAvatar nome={m.nome} avatarUrl={m.avatar} size={28} />
                  <span className="min-w-0 truncate">
                    {nome}
                    {ehProprio ? (
                      <span className="text-muted-foreground"> (você)</span>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <TeamRoleBadge papel={m.papel} />
                  {podeRemover(m) ? (
                    <RemoveMemberButton
                      escopo={escopo}
                      alvoId={alvoId}
                      userId={m.userId}
                      nome={nome}
                    />
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
