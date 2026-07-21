import { beforeEach, describe, expect, it, vi } from "vitest"

import { removerEscudoCustom, subirEscudoCustom } from "@/lib/escudoCustom"

const COMPETITOR = "11111111-1111-4111-8111-111111111111"
// Espelha o NEXT_PUBLIC_SUPABASE_URL injetado pelo vitest.config.ts.
const BASE = "https://exemplo.supabase.co/storage/v1/object/public/escudos/"

function bytesPng(): Uint8Array {
  // Assinatura PNG + enchimento.
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
}
function bytesWebp(): Uint8Array {
  const b = new Uint8Array(16)
  b.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  return b
}

/** File mínimo: só `type`, `size` e `arrayBuffer` importam para a validação. */
function arquivo(type: string, bytes: Uint8Array, size = bytes.length): File {
  return {
    type,
    size,
    arrayBuffer: async () => bytes.buffer.slice(0) as ArrayBuffer,
  } as unknown as File
}

function clienteStorage() {
  const upload = vi.fn().mockResolvedValue({ error: null })
  const remove = vi.fn().mockResolvedValue({ error: null })
  const supabase = {
    storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
  }
  return { supabase: supabase as never, upload, remove }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("subirEscudoCustom", () => {
  it("sobe PNG válido sob custom/<competitor_id>/<uuid>.png e devolve a URL pública", async () => {
    const { supabase, upload } = clienteStorage()
    const r = await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/png", bytesPng()))

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.url.startsWith(`${BASE}custom/${COMPETITOR}/`)).toBe(true)
    expect(r.url.endsWith(".png")).toBe(true)

    const [path, , opcoes] = upload.mock.calls[0]
    // O path é a CHAVE DE AUTORIZAÇÃO da policy de storage.
    expect(path).toMatch(
      new RegExp(`^custom/${COMPETITOR}/[0-9a-f-]{36}\\.png$`)
    )
    // Nunca upsert: o bucket serve com cache de 1 ano; nome novo é cache-busting.
    expect(opcoes).toMatchObject({ contentType: "image/png", upsert: false })
  })

  it("aceita WEBP", async () => {
    const { supabase } = clienteStorage()
    const r = await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/webp", bytesWebp()))
    expect(r.ok).toBe(true)
  })

  it("recusa arquivo que MENTE sobre o tipo (magic bytes não batem)", async () => {
    const { supabase, upload } = clienteStorage()
    // Declara PNG mas os bytes são WEBP.
    const r = await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/png", bytesWebp()))
    expect(r).toEqual({
      ok: false,
      error: "O conteúdo do arquivo não corresponde ao tipo informado.",
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it("recusa conteúdo que não é imagem PNG/WEBP", async () => {
    const { supabase, upload } = clienteStorage()
    const r = await subirEscudoCustom(
      supabase,
      COMPETITOR,
      arquivo("image/png", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
    )
    expect(r.ok).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it("recusa JPEG e SVG (fora do allowed_mime_types do bucket)", async () => {
    const { supabase, upload } = clienteStorage()
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect((await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/jpeg", jpeg))).ok).toBe(
      false
    )
    expect(
      (await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/svg+xml", bytesPng()))).ok
    ).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it("recusa acima de 256KB (espelha o file_size_limit do bucket)", async () => {
    const { supabase, upload } = clienteStorage()
    const r = await subirEscudoCustom(
      supabase,
      COMPETITOR,
      arquivo("image/png", bytesPng(), 256 * 1024 + 1)
    )
    expect(r).toEqual({ ok: false, error: "A imagem deve ter no máximo 256KB." })
    expect(upload).not.toHaveBeenCalled()
  })

  it("recusa arquivo vazio", async () => {
    const { supabase } = clienteStorage()
    const r = await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/png", bytesPng(), 0))
    expect(r).toEqual({ ok: false, error: "Selecione uma imagem." })
  })

  it("erro do Storage não vaza detalhe", async () => {
    const { supabase, upload } = clienteStorage()
    upload.mockResolvedValue({ error: { message: "boom interno" } })
    const r = await subirEscudoCustom(supabase, COMPETITOR, arquivo("image/png", bytesPng()))
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível enviar o escudo. Tente novamente.",
    })
  })
})

describe("removerEscudoCustom", () => {
  it("remove o objeto sob custom/", async () => {
    const { supabase, remove } = clienteStorage()
    await removerEscudoCustom(supabase, `${BASE}custom/${COMPETITOR}/abc.png`)
    expect(remove).toHaveBeenCalledWith([`custom/${COMPETITOR}/abc.png`])
  })

  it("NUNCA alcança o catálogo global (<external_id>.png é write-once)", async () => {
    const { supabase, remove } = clienteStorage()
    await removerEscudoCustom(supabase, `${BASE}117.png`)
    expect(remove).not.toHaveBeenCalled()
  })

  it("ignora URL de outro host e ausência de URL", async () => {
    const { supabase, remove } = clienteStorage()
    await removerEscudoCustom(supabase, "https://evil.example/custom/x/y.png")
    await removerEscudoCustom(supabase, null)
    expect(remove).not.toHaveBeenCalled()
  })
})
