## Why

O upload de evidência de resultado (`src/lib/evidence.ts`, usado por
`scoreProposals.ts` e `wo.ts`) valida **apenas** `file.size` e `file.type`. O `file.type`
é o MIME **declarado pelo cliente** — facilmente falsificável — e é propagado tal e qual
no `upload(..., { contentType: file.type })`. Além disso, fotos tiradas de câmera de
celular carregam metadados EXIF, incluindo **coordenadas de GPS**, que hoje sobem intactos
para o Storage.

O risco já é **bounded**: o bucket `match_evidence` é **privado** (leitura só via rota
autenticada com policy por arbitrar/jogador), o path `<uid>/<matchId>/<rand>.<ext>` é
construído no servidor (não forjável) e o allowlist (`png`/`jpg`/`webp`) já corta SVG (e
com ele o vetor de XSS). Portanto isto é **hardening + privacidade**, não correção de
urgência: defesa em profundidade contra conteúdo com MIME mentido e remoção de metadados
sensíveis antes de persistir.

## What Changes

Mantendo o comportamento atual (bucket privado, path server-side, allowlist png/jpg/webp,
limite de 5MB, assinatura pública de `subirEvidencia` inalterada):

1. **Sniff de magic bytes.** Antes de subir, `subirEvidencia` lê os bytes reais do arquivo
   (`await file.arrayBuffer()`) e confirma a assinatura contra o allowlist e contra o
   `file.type` declarado. A checagem vive numa **função pura exportada**
   `sniffTipoImagem(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | null`:
   - PNG: `89 50 4E 47 0D 0A 1A 0A`
   - JPEG: `FF D8 FF`
   - WEBP: `52 49 46 46` (RIFF) nos bytes 0–3 **e** `57 45 42 50` (WEBP) nos bytes 8–11
   Se o conteúdo não estiver no allowlist, ou não corresponder ao MIME declarado, o upload
   é rejeitado com erro claro. O `contentType` enviado ao Storage passa a derivar do tipo
   **detectado** (confiável), não do declarado pelo cliente.

2. **Strip de EXIF (privacidade).** Foco no **JPEG** — principal fonte de GPS embutido.
   Uma função pura exportada `removerExifJpeg(bytes: Uint8Array): Uint8Array` remove o(s)
   segmento(s) `APP1` (marcador `FF E1`, que carrega EXIF e XMP) do stream JPEG, em
   puro-JS, sem reprocessar/re-encodar a imagem e sem dependências novas. O upload envia os
   bytes já sem EXIF. **PNG e WEBP não têm strip nesta change** (o GPS de câmera vem quase
   sempre em JPEG; PNG/WEBP raramente carregam GPS e o strip barato não é trivial) — fica
   documentado como escopo consciente.

3. **Testes.** Suíte Vitest para as funções puras (sem I/O): `sniffTipoImagem` com bytes
   válidos de cada tipo e com entradas inválidas/spoofadas; `removerExifJpeg` com um JPEG
   sintético contendo `APP1` (o segmento é removido, o restante permanece intacto e a
   estrutura segue sendo JPEG) e com um JPEG sem `APP1` (retorna equivalente).

## Impact

- **Specs:** ADDED `evidence-upload` (nova capability: validação por conteúdo + privacidade
  do upload de evidência).
- **Código (alterado):** `src/lib/evidence.ts` (novas funções puras exportadas +
  integração em `subirEvidencia`). **Novo:** `src/lib/evidence.test.ts`.
- **Call sites (sem regressão):** `src/actions/scoreProposals.ts:129` e
  `src/actions/wo.ts:413` — a assinatura de `subirEvidencia` e o formato de retorno não
  mudam.
- **Intocados:** bucket/policies/RLS, banco, schema, o restante das Server Actions,
  Realtime.
- **Risco:** baixo — a mudança só endurece a validação existente e remove metadados; um
  upload legítimo de PNG/JPG/WEBP continua funcionando. O maior cuidado é o parser JPEG não
  corromper o stream: coberto por teste de integridade estrutural.
