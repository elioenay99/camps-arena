"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { profileSchema } from "@/schema/authSchema"
import { createClient } from "@/lib/supabase/server"
import type { AuthState } from "@/actions/auth"

export type AvatarResult = { ok: true; url: string | null } | { ok: false; error: string }

const BUCKET = "avatars"
const MAX_BYTES = 2 * 1024 * 1024 // 2MB
/** Tipos aceitos → extensão do arquivo no storage. */
const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

const ERRO_GENERICO = "Não foi possível salvar agora. Tente novamente."

function revalidarPerfil() {
  // Header (avatar/nome) vive no layout; a página de conta mostra o perfil.
  revalidatePath("/", "layout")
  revalidatePath("/dashboard/conta")
}

/** Caminho do objeto no bucket a partir da URL pública (para apagar o antigo). */
function caminhoDaUrl(url: string | null): string | null {
  if (!url) return null
  const marca = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marca)
  return i === -1 ? null : url.slice(i + marca.length)
}

/** Atualiza nome e celular do PRÓPRIO usuário (linha de public.users). */
export async function atualizarPerfil(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = profileSchema.safeParse({
    nome: formData.get("nome"),
    celular: formData.get("celular"),
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
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Sessão expirada. Entre novamente." }
  }

  const { error } = await supabase
    .from("users")
    .update({ nome: parsed.data.nome, celular: parsed.data.celular })
    .eq("id", user.id)
  if (error) {
    console.error("atualizarPerfil falhou", error.code ?? error.message)
    return { error: ERRO_GENERICO }
  }

  revalidarPerfil()
  return { success: "Perfil atualizado." }
}

/** Envia/troca a foto: valida, sobe ao bucket na pasta do dono e grava a URL. */
export async function atualizarAvatar(formData: FormData): Promise<AvatarResult> {
  const arquivo = formData.get("avatar")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, error: "Selecione uma imagem." }
  }
  const ext = EXTENSAO_POR_TIPO[arquivo.type]
  if (!ext) {
    return { ok: false, error: "Use uma imagem PNG, JPG, WEBP ou GIF." }
  }
  if (arquivo.size > MAX_BYTES) {
    return { ok: false, error: "A imagem deve ter no máximo 2MB." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." }
  }

  // Nome único na pasta do dono → evita cache obsoleto e satisfaz a RLS por pasta.
  const caminho = `${user.id}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (uploadError) {
    console.error("atualizarAvatar upload falhou", uploadError.message)
    return { ok: false, error: ERRO_GENERICO }
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl

  // Lê a foto antiga ANTES de sobrescrever, para apagar o arquivo órfão depois.
  const { data: antigo } = await supabase
    .from("users")
    .select("avatar")
    .eq("id", user.id)
    .maybeSingle()

  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar: url })
    .eq("id", user.id)
  if (updateError) {
    console.error("atualizarAvatar update falhou", updateError.code ?? updateError.message)
    // Compensa: remove o arquivo recém-enviado para não deixar lixo.
    await supabase.storage.from(BUCKET).remove([caminho])
    return { ok: false, error: ERRO_GENERICO }
  }

  const antigoCaminho = caminhoDaUrl(antigo?.avatar ?? null)
  if (antigoCaminho && antigoCaminho !== caminho) {
    await supabase.storage.from(BUCKET).remove([antigoCaminho])
  }

  revalidarPerfil()
  return { ok: true, url }
}

/** Remove a foto: apaga o arquivo do bucket e zera a coluna. */
export async function removerAvatar(): Promise<AvatarResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: "Sessão expirada. Entre novamente." }
  }

  const { data: atual } = await supabase
    .from("users")
    .select("avatar")
    .eq("id", user.id)
    .maybeSingle()

  const { error } = await supabase
    .from("users")
    .update({ avatar: null })
    .eq("id", user.id)
  if (error) {
    console.error("removerAvatar falhou", error.code ?? error.message)
    return { ok: false, error: ERRO_GENERICO }
  }

  const caminho = caminhoDaUrl(atual?.avatar ?? null)
  if (caminho) {
    await supabase.storage.from(BUCKET).remove([caminho])
  }

  revalidarPerfil()
  return { ok: true, url: null }
}
