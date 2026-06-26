# Tasks — add-telefone-internacional

## 1. Dependência
- [x] 1.1 Adicionar `libphonenumber-js` às `dependencies` (`pnpm add libphonenumber-js`)

## 2. Validação (schema)
- [x] 2.1 Em `src/schema/authSchema.ts`: substituir `celularBR` por `celular` (normalizador
      `paraE164` + `refine`/`transform` → saída E.164); manter assume-BR para entrada sem `+`
- [x] 2.2 Apontar `signupSchema` e `profileSchema` para o novo `celular`
- [x] 2.3 `authSchema.test.ts`: BR nacional legado normaliza p/ `+55…`; E.164 PT/US válidos;
      número inválido p/ o país rejeitado; saída é E.164

## 3. Helper `wa.me`
- [x] 3.1 Em `src/lib/whatsapp.ts`: `linkWhatsApp` DDI-aware (ramo E.164 com `+`; manter
      fallbacks legados BR de 11 e 13 dígitos); atualizar o comentário do helper
- [x] 3.2 `whatsapp.test.ts`: E.164 PT/US/BR → `wa.me/<DDI><numero>`; legados BR preservados;
      inválido → null

## 4. Componente `PhoneField`
- [x] 4.1 Criar `src/features/auth/components/PhoneField.tsx` (`"use client"`): seletor de país
      buscável (padrão BR) + input do número com `AsYouType`; hidden `name` com E.164;
      inicialização por `defaultValue` (E.164 ou legado BR); lista via `libphonenumber-js` +
      `Intl.DisplayNames` (pt-BR) + bandeira emoji; a11y (label, aria-invalid/describedby)
- [x] 4.2 Componentes shadcn: NÃO foi preciso adicionar `command`/`popover` — o seletor reusa
      `dialog` + `input` já presentes (picker buscável modal, melhor no mobile, zero dep nova)
- [x] 4.3 Teste do `PhoneField`: inicializa de E.164 (resolve país), inicializa de legado BR
      (país BR), troca de país recompõe o E.164 oculto

## 5. Telas
- [x] 5.1 `SignupForm.tsx`: trocar o `<Input celular>` cru pelo `<PhoneField name="celular">`
- [x] 5.2 `ProfileForm.tsx`: idem, com `defaultValue={celular}`
- [x] 5.3 Conferir exibição em texto puro do celular (se houver) — formatar via E.164/helper

## 6. Specs
- [x] 6.1 Deltas: `auth` (cadastro + perfil aceitam E.164 internacional) e `match-engagement`
      (`linkWhatsApp` reconhece E.164 + legado BR) — refletidos nesta change

## 7. Gates de qualidade
- [x] 7.1 `pnpm typecheck` verde
- [x] 7.2 `pnpm lint` verde
- [x] 7.3 `pnpm test` verde (suíte completa)
- [x] 7.4 `pnpm build` verde
- [x] 7.5 Revisão adversarial do diff por workflow (0 must_fix antes do commit)
- [~] 7.6 Validação ao vivo: cadastro com número PT (+351) passa; `wa.me` resolve; cadastro BR
      segue idêntico (país padrão). ADIADA — bloqueada pela ação do dono (rate-limit de e-mail do
      Supabase free: desligar confirmação / configurar Resend). Código pronto e revisado, já em
      produção (`e5ea62e`). Validar assim que o cadastro estiver destravado. Ver
      [[arena-cadastro-incidente]].
