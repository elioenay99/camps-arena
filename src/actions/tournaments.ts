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
  // Conversão EXPLÍCITA da string do form (sem z.coerce — mesma decisão do
  // placar): campo vazio/ausente vira undefined e o Zod aplica o default;
  // string não-vazia vira Number (NaN é rejeitado pelo Zod); qualquer outro
  // tipo (ex.: File) passa cru e cai na validação do Zod.
  const pontosOuDefault = (campo: string) => {
    const valor = formData.get(campo)
    if (valor === null || valor === "") return undefined
    return typeof valor === "string" ? Number(valor) : valor
  }

  const parsed = createTournamentSchema.safeParse({
    titulo: formData.get("titulo"),
    // Checkbox nativo: qualquer presença no FormData = marcado; ausente = false.
    isPublic: formData.get("isPublic") !== null,
    pontosVitoria: pontosOuDefault("pontosVitoria"),
    pontosEmpate: pontosOuDefault("pontosEmpate"),
    pontosDerrota: pontosOuDefault("pontosDerrota"),
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
      // Sempre enviados (defaults do Zod): o default do DDL é só para
      // torneios legados/escritas administrativas.
      pontos_vitoria: parsed.data.pontosVitoria,
      pontos_empate: parsed.data.pontosEmpate,
      pontos_derrota: parsed.data.pontosDerrota,
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
