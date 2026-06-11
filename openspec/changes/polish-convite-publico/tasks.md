# Tasks — polish-convite-publico

## 1. Moldura e heróis

- [x] 1.1 `ConviteShell` (StadiumBackdrop + marca Goliseu discreta no topo + slot
      centrado com animate-rise). Extraído p/ módulo colocado `convite-ui.tsx`.
- [x] 1.2 `HeroClube` (TeamCrest 72px em halo glow-primary + nome display +
      "em {torneio}") e `HeroIcone` (ícone temático em halo, tons primário/neutro).
- [x] 1.3 `PainelConvite` (Card `elevate` centralizado) no lugar do Card genérico.
      Presentação extraída p/ `convite-ui.tsx` (reutilizável/testável); `page.tsx`
      mantém só a lógica de dados e importa os componentes.

## 2. Aplicar aos estados (textos/roles preservados)

- [x] 2.1 Vaga: aceite (herói clube), encerrado, vaga_ocupada, ja_tem_vaga (atalho).
- [x] 2.2 Avulso: aceite (herói Trophy + título), ja_participa, encerrado, iniciado.
- [x] 2.3 Deslogado (CTAs entrar/criar conta) e código inválido.

## 3. Validação

- [x] 3.1 Gates: typecheck ✅ / lint ✅ / test (page.test 15/15 inalterado) ✅ /
      build (rodando).
- [x] 3.2 Ao vivo (Playwright, rota de preview temporária com mock): herói clube
      COM escudo (Palmeiras) e SEM escudo (fallback iniciais "RF"), avulso,
      deslogado, ja_participa, inválido, encerrado — nos 2 temas (Dracula/Canarinho)
      + mobile 390px (coluna única, botões full-width). Smoke 200 na rota real
      (inválido + deslogado).
- [ ] 3.3 Workflow adversarial; commit + push + CI verde + archive.
