## 1. Funções puras em `src/lib/evidence.ts`

- [ ] 1.1 `sniffTipoImagem(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | null` — detecta o
  tipo pela assinatura real (PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`; WEBP `RIFF`
  0–3 + `WEBP` 8–11). Retorna `null` fora do allowlist. Exportada e sem I/O.
- [ ] 1.2 `removerExifJpeg(bytes: Uint8Array): Uint8Array` — remove segmento(s) `APP1`
  (`FF E1`) do stream JPEG em puro-JS, sem re-encodar; entrada não-JPEG volta intacta;
  preserva SOI, demais segmentos e os dados de scan (a partir de `FF DA`). Exportada.

## 2. Integração em `subirEvidencia`

- [ ] 2.1 Ler `await file.arrayBuffer()`, rodar `sniffTipoImagem`; rejeitar com erro claro se
  `null` ou se o tipo detectado não corresponder ao `file.type` declarado.
- [ ] 2.2 Para JPEG, aplicar `removerExifJpeg` antes do upload; PNG/WEBP sobem sem strip.
- [ ] 2.3 Enviar os bytes finais com `contentType` derivado do tipo DETECTADO (não do
  declarado pelo cliente). Manter bucket privado, path `<uid>/<matchId>/<rand>.<ext>`,
  limite de 5MB e a assinatura pública de `subirEvidencia`.

## 3. Testes (`src/lib/evidence.test.ts`)

- [ ] 3.1 `sniffTipoImagem`: PNG/JPEG/WEBP válidos → tipo certo; bytes aleatórios/curtos → `null`;
  spoof (ex.: bytes de PNG com "MIME" JPEG na chamada) coberto pela verificação de correspondência.
- [ ] 3.2 `removerExifJpeg`: JPEG sintético com `APP1` → segmento removido, resto intacto,
  segue começando por `FF D8`; JPEG sem `APP1` → saída equivalente à entrada.

## 4. Verificação

- [ ] 4.1 `pnpm typecheck` verde.
- [ ] 4.2 `pnpm lint` verde.
- [ ] 4.3 `pnpm test` verde (novo `evidence.test.ts` + `scoreProposals.test.ts`/`wo` não regridem).
