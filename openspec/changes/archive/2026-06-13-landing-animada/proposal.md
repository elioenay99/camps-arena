# Proposal — landing-animada

## Why

A landing (`/`) é o material de aquisição do Goliseu, mas hoje é **estática**: hero
de texto puro, um card de preview parado (só a bolinha "ao vivo" pulsa) e cards de
destaque sem vida. O usuário pediu para dar o "tapa final" com **ilustração SVG
animada** no hero e movimento **pela landing inteira** — "o máximo de animação,
porém caprichado, sem exagerar pra não ficar feio". A marca é **Goliseu** (gol +
Coliseu → arena/estádio) e já há a atmosfera "estádio à noite"
([[arena-paleta-visual]]); falta o hero ganhar a ilustração que a vende.

## What Changes

Apresentação apenas (rota pública, sem dados/auth novos). A landing permanece
**RSC** — todo o movimento é **CSS** (sem `"use client"`), na identidade existente
(sem fonte/cor nova; tokens `--primary`/`--gold`/`--glow-accent`). **TUDO zerado
sob `prefers-reduced-motion`** e validado **mobile-first (390px)** nos 2 temas.

- **Hero: ilustração SVG animada de estádio/campo** (`HeroStadium`, novo): campo
  em perspectiva sob refletores (glows que respiram), bola rolando em loop até o
  gol e a **rede estufando** na chegada; nó de "coliseu" (arquibancada em arco).
  SVG inline temável (currentColor + CSS vars), responsivo (viewBox), decorativo
  (`aria-hidden`) — o hero textual segue sendo o conteúdo acessível.
- **Orquestração de entrada**: revelação encadeada (stagger via `--stagger` +
  `animate-rise`) de header → badge → título → subtítulo → CTAs → ilustração →
  card de preview → cards de destaque. Um page-load bem coreografado (alto
  impacto) em vez de micro-animações espalhadas.
- **Card de preview "vivo"**: realce do campeão (`trophy-sheen`, já existe), pulso
  do "ao vivo" (já existe) e um tique sutil no placar.
- **Toques finais**: brilho no badge, `glow-primary` + respiração leve no CTA,
  entrada/realce dos cards de destaque (mantendo o hover-lift atual).
- **Novos keyframes** em `globals.css` para o estádio (rolar da bola, rede,
  respiro do refletor), todos no bloco `prefers-reduced-motion: reduce` que já
  zera as animações da identidade.

## Capabilities

Nenhuma nova. Adiciona um requisito de APRESENTAÇÃO à `app-shell` (landing
animada na identidade), sem mudar o comportamento da landing (redireciona logado,
falha-segura para visitante, CTAs).

## Impact

- **Novo**: `src/features/landing/HeroStadium.tsx` (ou
  `src/components/hero-stadium.tsx`) — ilustração SVG animada, decorativa.
- **Editados**: `src/app/page.tsx` (insere a ilustração, aplica stagger e os
  realces), `src/app/globals.css` (keyframes do estádio + bloco reduced-motion).
- **Sem mudança**: auth/redirect da landing, rotas, dados, demais telas.
- **Risco**: baixo (presentational, CSS-only, RSC). Pontos de atenção: a
  ilustração não pode pesar no mobile (sem jank — animar só transform/opacity);
  contraste AA do texto sobre a ilustração nos 2 temas; reduced-motion realmente
  zerar tudo; nada de fonte/cor fora da identidade.
