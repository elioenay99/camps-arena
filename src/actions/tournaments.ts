"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { createTournamentSchema } from "@/schema/tournamentSchema"

export type TournamentFormState = {
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

/**
 * Cria um torneio com o usuário da sessão como dono. `created_by` é definido
 * no SERVIDOR (`user.id`) — o cliente não informa o dono, e a RLS
 * (`with check (created_by = auth.uid())`) é a segunda barreira. Defesa em
 * profundidade: sessão exigida aqui + políticas no banco.
 */
export async function createTournament(
  _prevState: TournamentFormState,
  formData: FormData
): Promise<TournamentFormState> {
  const parsed = createTournamentSchema.safeParse({
    titulo: formData.get("titulo"),
    // Checkbox nativo: qualquer presença no FormData = marcado; ausente = false.
    isPublic: formData.get("isPublic") !== null,
  })

  if (!parsed.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: "Sessão expirada. Entre novamente para criar um torneio." }
  }

  try {
    const { error } = await supabase.from("tournaments").insert({
      titulo: parsed.data.titulo,
      is_public: parsed.data.isPublic,
      created_by: user.id,
    })
    if (error) {
      console.error("createTournament falhou", error.code ?? error.message)
      return { error: "Não foi possível criar o torneio agora. Tente novamente." }
    }
  } catch {
    return { error: "Não foi possível criar o torneio agora. Tente novamente." }
  }

  // redirect() fora do try/catch (lança NEXT_REDIRECT).
  revalidatePath("/dashboard")
  redirect("/dashboard")
}
