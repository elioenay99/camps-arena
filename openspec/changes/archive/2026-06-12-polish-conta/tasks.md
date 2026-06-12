# Tasks — polish-conta

## 1. Apresentação (lógica/contrato preservados)

- [x] 1.1 Cabeçalhos de seção (helper `SecaoCard`): ícone em chip (User / KeyRound)
      + título `font-display`; main `max-w-xl` + cards `w-full` (alinham com o `h1`).
- [x] 1.2 `AvatarUpload`: anel NEUTRO `ring-foreground/20` no avatar (não compete
      com a cor `corDoNome`); `UserAvatar` intocado.

## 2. Validação

- [x] 2.1 Gates: typecheck / lint / test (UserAvatar 5/5 + suíte 848) / build.
- [x] 2.2 Ao vivo (Playwright): conta nos 2 temas + 390px; anel visível sobre o
      avatar verde.
- [x] 2.3 Workflow adversarial (10 confirmados, approved_with_nits, 0 must_fix);
      fix do anel neutro. Descartados: font-display no CardTitle (idioma do projeto),
      "contrato do CardHeader" (wrapper é o padrão), size do chip / h1 sem ícone
      (sem padrão global). Commit + push + CI + archive.
