# Tasks — landing-animada

## 1. Ilustração SVG do hero

- [ ] 1.1 `HeroStadium` (novo, RSC, `aria-hidden`): SVG inline temável (CSS vars/
      currentColor), responsivo (viewBox). Campo em perspectiva + refletores
      (glow que respira) + bola rolando em loop até o gol + rede estufando + nó
      de coliseu (arco da arquibancada). Animar SÓ transform/opacity (sem jank).
- [ ] 1.2 Keyframes em `globals.css` (rolar da bola, rede, respiro do refletor),
      adicionados ao bloco `prefers-reduced-motion: reduce` (estado parado
      legível).

## 2. Orquestração e realces da landing

- [ ] 2.1 `page.tsx`: stagger de entrada (`animate-rise` + `--stagger`) em
      header/badge/título/subtítulo/CTAs/ilustração/preview/destaques.
- [ ] 2.2 Card de preview "vivo" (trophy-sheen + pulso já existem; tique sutil no
      placar) e brilho do badge + respiro do CTA + entrada dos cards de destaque.

## 3. Validação (gates automáticos)

- [ ] 3.1 Gates: typecheck / lint / test / build.
- [ ] 3.2 Ao vivo (Playwright): landing em 390px E desktop, nos 2 temas
      (Dracula/Canarinho), + simulação de `prefers-reduced-motion` (tudo parado e
      legível). Screenshots; iterar até "top".
- [ ] 3.3 Workflow de revisão adversarial (a11y/contraste, performance/jank,
      reduced-motion, mobile, qualidade de código, fidelidade à marca); aplicar
      fixes; commit + push + CI + archive.
