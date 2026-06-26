# Proposal — add-telefone-internacional

## Why

O campo `celular` é **brasileiro de ponta a ponta**, e isso bloqueia usuários de fora do
Brasil — exatamente quem o dono está convidando. Caso real (chat 2026-06-25): um convidado
de **Portugal** (+351) não conseguiu aceitar o convite porque o cadastro **exige** o formato
BR e rejeita o número dele.

O problema é mais fundo que a tela de cadastro:

- **Validação** (`src/schema/authSchema.ts`, `celularBR`): regex `/^[1-9]{2}9\d{8}$/` — só
  aceita DDD + 9 + 8 dígitos. Usada no `signupSchema` **e** no `profileSchema`. Um número PT
  (9 dígitos) é recusado.
- **Link `wa.me`** (`src/lib/whatsapp.ts`, `linkWhatsApp`): infere o DDI **55 pelo
  comprimento** (11 díg → prefixa `55`; 13 díg começando com `55` → direto; **qualquer outro
  → `null`**). Ou seja, mesmo que um número estrangeiro fosse salvo, o atalho de WhatsApp
  **sumiria silenciosamente** justo para o estrangeiro — que é quem mais precisa ser contatado.
- **Input** (`SignupForm`, `ProfileForm`): `placeholder="(11) 91234-5678"`,
  `autoComplete="tel-national"`, sem qualquer noção de país.

Decisão do dono (AskUserQuestion 2026-06-25): **suporte internacional completo** — seletor de
país (padrão Brasil), validação por país, armazenamento E.164, `wa.me` funcionando para
qualquer país. Os números BR legados (11 díg, sem DDI) **continuam válidos** — sem migração
de banco.

## What Changes

- **Validação internacional (E.164)** — `celularBR` vira `celular` em
  `src/schema/authSchema.ts`, validando com `libphonenumber-js`: aceita E.164 de qualquer país
  suportado e o legado nacional BR (11 díg sem DDI, assumindo país BR), **normalizando a saída
  para E.164** (`+351931482194`). Inválido → erro por campo, sem tocar o Supabase. `signupSchema`
  e `profileSchema` passam a usar `celular`. Storage passa a ser E.164 automaticamente (o
  `signup` manda como metadata; `atualizarPerfil` grava o valor normalizado).

- **Input com seletor de país** — novo componente client `PhoneField`
  (`src/features/auth/components/PhoneField.tsx`): seletor de país **buscável** (bandeira +
  DDI, padrão Brasil) + campo do número com formatação ao vivo (`AsYouType`). Compõe o E.164 num
  `<input type="hidden" name="celular">`, **preservando o fluxo FormData/Server Action atual**
  (a action segue lendo `formData.get("celular")`, agora E.164). Inicializa a partir de
  `defaultValue`: E.164 → resolve país/número; legado BR (sem `+`) → país BR. Lista de países e
  DDIs vêm de `libphonenumber-js` (`getCountries`/`getCountryCallingCode`); nomes em pt-BR via
  `Intl.DisplayNames`; bandeiras via emoji de indicadores regionais (sem assets). Usado no
  `SignupForm` **e** no `ProfileForm`.

- **`linkWhatsApp` DDI-aware** — em `src/lib/whatsapp.ts`, generaliza a normalização: valor com
  `+` (E.164) usa os dígitos com o DDI embutido (`wa.me/<DDI><numero>`); **mantém o fallback
  legado BR** (11 díg → `55…`; 13 díg `55…` → direto). Inválido → `null`. Nenhuma das superfícies
  consumidoras (modal, card, listas, texto de rodada/lista de times, OG) muda de assinatura.

## Impact

- **Specs**: `auth` (cadastro + edição de perfil aceitam celular internacional E.164),
  `match-engagement` (helper `linkWhatsApp` reconhece E.164 internacional + legado BR).
- **Banco**: **nenhuma DDL**. `users.celular` já é `text` sem constraint; o trigger
  `handle_new_user` copia a metadata como está. Legados BR de 11 díg permanecem legíveis pelo
  `wa.me`. Não há migração nem backfill.
- **Dependência**: adiciona `libphonenumber-js` (metadata padrão/`min`, tree-shakeable, ~100KB
  min) — usada na validação (schema) e no `PhoneField` (lista de países + `AsYouType`). Custo
  aceito pelo dono no AskUserQuestion.
- **Código**: `authSchema.ts` (validador `celular`), novo `PhoneField`, `SignupForm` +
  `ProfileForm` (trocam o `<Input>` cru pelo `PhoneField`), `whatsapp.ts` (`linkWhatsApp`).
  Testes: `authSchema.test.ts` (BR legado normaliza p/ +55, PT/US válidos, inválido rejeitado),
  `whatsapp.test.ts` (casos E.164 + legados preservados), teste do `PhoneField`.
- **Compatibilidade**: aditivo e retrocompatível. Cadastros BR seguem idênticos (país padrão =
  Brasil, um toque a menos pro caso majoritário); perfis BR legados abrem no país BR; todos os
  `wa.me` legados continuam funcionando.
- **Fora de escopo**: confirmação por SMS/OTP, validação estrita mobile-vs-fixo por país (a
  metadata padrão valida o plano de numeração, suficiente para o `wa.me`), troca do `celular`
  para uma coluna estruturada, e qualquer i18n de idioma da aplicação.
