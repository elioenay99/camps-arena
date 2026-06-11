# Tasks — add-pwa

## 1. Ícones

- [x] 1.1 `public/icon-192.png` e `public/icon-512.png` (do escudo G,
      transparentes, purpose any).
- [x] 1.2 `public/icon-maskable.png` (512, fundo opaco `#21222c` + escudo na
      safe-zone ~66%, p/ recorte Android).
- [x] 1.3 `app/apple-icon.png` (180×180, fundo opaco — iOS).

## 2. Manifest + metadata

- [x] 2.1 `app/manifest.ts` (name/short_name Goliseu, standalone, start_url,
      lang pt-BR, cores Dracula, categories sports, icons 192/512/maskable).
- [x] 2.2 `layout.tsx`: `viewport.themeColor` por esquema + `appleWebApp` (capable,
      title "Goliseu", statusBarStyle black-translucent). CSP intocada (manifest
      cai em default-src 'self'; ícones em img-src 'self').

## 3. Validação

- [x] 3.1 Gates: typecheck ✅ / lint ✅ / test (848) ✅ / build ✅.
- [x] 3.2 `next start`: `/manifest.webmanifest` 200 (application/manifest+json,
      JSON correto); `/icon-192|512|maskable.png` e `/apple-icon.png` 200 image/png;
      `<link rel=manifest>` + apple-touch-icon + 2 theme-color (dark/light) no head;
      CSP `default-src 'self'`/`img-src 'self'` não bloqueia. PNGs inspecionados.
- [ ] 3.3 Workflow adversarial; commit + push + CI verde + archive.
