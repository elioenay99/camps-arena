import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Código de convite do torneio — SÓ o dono recebe algo (RLS de
 * `tournament_invites` restringe tudo ao dono; para qualquer outro usuário a
 * query devolve vazio, indistinguível de "ainda sem convite"). `null` na
 * página do dono significa torneio legado sem código → a UI oferece gerar.
 */
export async function getConviteDoTorneio(
  tournamentId: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tournament_invites")
    .select("code")
    .eq("tournament_id", tournamentId)
    .maybeSingle()

  if (error) {
    throw new Error(`Falha ao carregar o convite: ${error.message}`)
  }

  return data?.code ?? null
}
