import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"

/**
 * Identidade visual do competidor na página de perfil. Modo CLUBE (escudoUrl)
 * renderiza o `TeamCrest`; modo NOME (por rótulo, sem escudo) cai para o
 * `UserAvatar` (inicial + cor estável). Ambos são decorativos (`aria-hidden`):
 * o nome acompanha em texto onde for usado.
 */
export function CompetidorIdentidade({
  nome,
  escudoUrl,
  porNome,
  size = 24,
  className,
}: {
  nome: string
  escudoUrl: string | null
  porNome: boolean
  size?: number
  className?: string
}) {
  // Modo clube só quando NÃO é por-nome E há escudo; senão, avatar neutro com
  // a inicial do nome (o fetcher já garante escudoUrl=null no modo nome).
  if (!porNome && escudoUrl) {
    return (
      <TeamCrest nome={nome} escudoUrl={escudoUrl} size={size} className={className} />
    )
  }
  return <UserAvatar nome={nome} avatarUrl={null} size={size} className={className} />
}
