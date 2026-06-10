# Tasks — polish-pagina-torneio

## 1. Header-hero + StatusPill compartilhada

- [x] 1.1 `StatusPill` extraída p/ `features/tournament/components/StatusPill.tsx`
      (encerrado = gold-ink); índice passa a importá-la.
- [x] 1.2 Header-hero na página do torneio: ícone do formato + título + chips
      (status/formato/ida-volta/3º/pontos) + ação. Remove `subtitulo`/`LABEL_STATUS`.

## 2. Seções

- [x] 2.1 `SecaoTorneio` (heading iconado + ação) aplicado a chave, grupos,
      mata-mata, classificação, partidas abertas, W.O., encerradas, clubes.
- [x] 2.2 `EstadoVazioSecao` (ícone com glow) nos estados vazios; administração
      com ícone Settings2.

## 3. Validação

- [x] 3.1 Gates: typecheck/lint/test (848 ✅) + build.
- [x] 3.2 Ao vivo (Playwright): Liga rascunho — header/chips, Iniciar, Vagas,
      empty states, administração.
- [x] 3.3 Workflow adversarial (3 lentes): mudança LIMPA, 1 achado low confirmado
      e PRÉ-EXISTENTE (pílula "Ativo" ~4.37:1 no light — código byte-idêntico ao
      antigo, só extraído p/ StatusPill). Sem regressão nova. Fix do "Ativo"
      deferido (toca a cor de marca; alinhar com o usuário) — quick-win amanhã.
- [x] 3.4 Commit + push + CI verde + archive.
