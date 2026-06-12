# Tasks — polish-nova-partida

## 1. Apresentação (lógica/contrato preservados)

- [x] 1.1 `MatchCreateForm`: conector `×` (divisor com badge central, linhas
      `bg-foreground/15` visíveis nos 2 temas) entre os dois selects; names/opção
      "Definir depois" intactos.
- [x] 1.2 Cabeçalho consistente nas duas páginas: ícone `Swords` em chip +
      título `font-display`, centralizado via wrapper (CardHeader grid intacto).

## 2. Validação

- [x] 2.1 Gates: typecheck / lint / test (suíte 848) / build.
- [x] 2.2 Ao vivo (Playwright): form (com participantes) e seletor nos 2 temas +
      ~390px; divisor visível no dark; cabeçalho centralizado.
- [x] 2.3 Workflow adversarial (11 confirmados, approved_with_nits, 0 must_fix);
      fixes (divisor visível no dark; refactor do CardHeader p/ wrapper).
      Descartados: badge × (passa AA), chip de ícone (sistêmico), gap-3 (ok no 390px),
      alinhamento do seletor (lista left é correta). Commit + push + CI + archive.
