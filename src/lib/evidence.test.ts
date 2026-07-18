import { describe, expect, it, vi } from "vitest"

import { removerExifJpeg, sniffTipoImagem, subirEvidencia } from "@/lib/evidence"

const b = (...nums: number[]) => Uint8Array.from(nums)

// Assinaturas reais (magic bytes) + um mínimo de corpo para passar do sniff.
const PNG = b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00)
const JPEG = b(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10)
const WEBP = b(
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x00, 0x00, 0x00, // tamanho (irrelevante para o sniff)
  0x57, 0x45, 0x42, 0x50 // "WEBP"
)

describe("sniffTipoImagem", () => {
  it("reconhece PNG pela assinatura", () => {
    expect(sniffTipoImagem(PNG)).toBe("png")
  })

  it("reconhece JPEG pela assinatura", () => {
    expect(sniffTipoImagem(JPEG)).toBe("jpeg")
  })

  it("reconhece WEBP por RIFF (0-3) + WEBP (8-11)", () => {
    expect(sniffTipoImagem(WEBP)).toBe("webp")
  })

  it("rejeita bytes arbitrários (fora do allowlist)", () => {
    expect(sniffTipoImagem(b(0x00, 0x01, 0x02, 0x03, 0x04, 0x05))).toBeNull()
  })

  it("rejeita entradas curtas demais para a assinatura", () => {
    expect(sniffTipoImagem(b(0x89, 0x50))).toBeNull()
    expect(sniffTipoImagem(b(0xff, 0xd8))).toBeNull() // JPEG precisa do 3o 0xFF
  })

  it("rejeita RIFF que não é WEBP (ex.: WAV)", () => {
    const wav = b(
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45 // "WAVE"
    )
    expect(sniffTipoImagem(wav)).toBeNull()
  })

  it("um PNG real detectado NÃO se passa por JPEG (base do anti-spoof)", () => {
    // A action rejeita quando o tipo detectado difere do MIME declarado; aqui
    // garantimos que o detector devolve o tipo verdadeiro, não o declarado.
    expect(sniffTipoImagem(PNG)).toBe("png")
    expect(sniffTipoImagem(PNG)).not.toBe("jpeg")
  })
})

describe("removerExifJpeg", () => {
  // JPEG sintético: SOI + APP1(EXIF) + APP0(JFIF) + SOS + scan + EOI.
  const APP1 = [
    0xff, 0xe1, 0x00, 0x0c, // marcador + tamanho (12 = 2 + 10 de dados)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x11, 0x22, 0x33, 0x44, // 4 bytes de "EXIF" (ex.: GPS falso)
  ]
  const APP0 = [
    0xff, 0xe0, 0x00, 0x10, // marcador + tamanho (16 = 2 + 14 de dados)
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // resto do JFIF
  ]
  const SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x3f, 0x00, 0xaa, 0xbb, 0xff, 0xd9]
  const SOI = [0xff, 0xd8]

  it("remove o segmento APP1 e preserva o resto", () => {
    const entrada = b(...SOI, ...APP1, ...APP0, ...SCAN)
    const saida = removerExifJpeg(entrada)

    // Ainda começa por SOI (FF D8).
    expect(saida[0]).toBe(0xff)
    expect(saida[1]).toBe(0xd8)
    // Encolheu exatamente o tamanho on-wire do APP1 (2 marcador + 12 tamanho).
    expect(saida.length).toBe(entrada.length - APP1.length)
    // Resultado esperado = SOI + APP0 + SCAN (sem o APP1).
    expect(Array.from(saida)).toEqual([...SOI, ...APP0, ...SCAN])
    // O marcador APP1 (FF E1) não aparece mais.
    let temApp1 = false
    for (let i = 0; i + 1 < saida.length; i++) {
      if (saida[i] === 0xff && saida[i + 1] === 0xe1) temApp1 = true
    }
    expect(temApp1).toBe(false)
    // Os dados de scan e o EOI seguem intactos no fim.
    expect(Array.from(saida.subarray(saida.length - SCAN.length))).toEqual(SCAN)
  })

  it("não altera um JPEG sem APP1", () => {
    const entrada = b(...SOI, ...APP0, ...SCAN)
    const saida = removerExifJpeg(entrada)
    expect(Array.from(saida)).toEqual(Array.from(entrada))
  })

  it("devolve bytes não-JPEG inalterados", () => {
    const saida = removerExifJpeg(PNG)
    expect(saida).toBe(PNG) // mesma referência: nada a fazer
  })

  it("remove múltiplos APP1 (EXIF + XMP)", () => {
    const XMP = [0xff, 0xe1, 0x00, 0x06, 0x78, 0x6d, 0x70, 0x21] // 2o APP1
    const entrada = b(...SOI, ...APP1, ...XMP, ...APP0, ...SCAN)
    const saida = removerExifJpeg(entrada)
    expect(Array.from(saida)).toEqual([...SOI, ...APP0, ...SCAN])
  })
})

// Exercita a subirEvidencia REAL (sem mockar @/lib/evidence) com um stub de
// ServerClient, para blindar os invariantes que o mutation testing pega:
// (1) rejeição de MIME spoofado; (2) strip de EXIF antes do upload.
describe("subirEvidencia (integração com storage stub)", () => {
  function stubClient() {
    const upload = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(
      async () => ({ error: null })
    )
    const remove = vi.fn<(...args: unknown[]) => Promise<{ error: null }>>(
      async () => ({ error: null })
    )
    const supabase = {
      storage: { from: () => ({ upload, remove }) },
    } as unknown as Parameters<typeof subirEvidencia>[0]
    return { supabase, upload }
  }

  it("rejeita MIME spoofado (conteúdo JPEG declarado como image/png) e NÃO sobe", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    const file = new File([jpeg], "x.png", { type: "image/png" })
    const { supabase, upload } = stubClient()

    const r = await subirEvidencia(supabase, "u1", "m1", file)

    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/não corresponde ao tipo/i),
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it("remove o EXIF (APP1) antes de subir o JPEG ao storage", async () => {
    const SOI = [0xff, 0xd8]
    const APP1 = [
      0xff, 0xe1, 0x00, 0x0c, // marcador + tamanho (12)
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x11, 0x22, 0x33, 0x44, // GPS falso
    ]
    const APP0 = [
      0xff, 0xe0, 0x00, 0x10,
      0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ]
    const SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x3f, 0x00, 0xaa, 0xff, 0xd9]
    const entrada = new Uint8Array([...SOI, ...APP1, ...APP0, ...SCAN])
    const file = new File([entrada], "e.jpg", { type: "image/jpeg" })
    const { supabase, upload } = stubClient()

    const r = await subirEvidencia(supabase, "u1", "m1", file)

    expect(r.ok).toBe(true)
    expect(upload).toHaveBeenCalledTimes(1)
    const corpo = upload.mock.calls[0][1] as Uint8Array
    // Menor que o original: o segmento APP1 foi removido.
    expect(corpo.length).toBe(entrada.length - APP1.length)
    // Nenhum marcador APP1 (FF E1) sobrou no corpo enviado.
    let temApp1 = false
    for (let i = 0; i + 1 < corpo.length; i++) {
      if (corpo[i] === 0xff && corpo[i + 1] === 0xe1) temApp1 = true
    }
    expect(temApp1).toBe(false)
    // Ainda é JPEG (começa por SOI).
    expect(corpo[0]).toBe(0xff)
    expect(corpo[1]).toBe(0xd8)
  })
})
