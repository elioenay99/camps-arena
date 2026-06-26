# Design — add-telefone-internacional

## Biblioteca: `libphonenumber-js`

Padrão da indústria para validar/parsear telefones por país. Escolha do build:

- Import **default** `from "libphonenumber-js"` (metadata `min`): valida o **plano de
  numeração** do país via `isValidPhoneNumber` / `parsePhoneNumber(...).isValid()`. Suficiente
  para o objetivo (um número que o WhatsApp consiga abrir). NÃO distingue mobile×fixo — isso
  exigiria a metadata `max`/`mobile`, que pesa mais e é frágil entre países; fora de escopo
  (decisão: o campo alimenta um `wa.me`, não um gateway de SMS).
- API usada: `parsePhoneNumber`, `isValidPhoneNumber`, `getCountries`, `getCountryCallingCode`,
  `AsYouType`. Tudo tree-shakeable.

## Normalização para E.164 (fonte única no schema)

`src/schema/authSchema.ts` ganha um normalizador puro e o validador `celular`:

```ts
import { parsePhoneNumber } from "libphonenumber-js"

/** Converte entrada (E.164 ou nacional BR legado) em E.164, ou null se inválida. */
function paraE164(bruto: string): string | null {
  const v = bruto.trim()
  if (!v) return null
  try {
    // Com '+' → internacional (país inferido do DDI). Sem '+' → assume BR
    // (entrada nacional do PhoneField BR e linhas legadas de 11 dígitos).
    const pn = parsePhoneNumber(v, v.startsWith("+") ? undefined : "BR")
    return pn?.isValid() ? pn.number : null
  } catch {
    return null
  }
}

export const celular = z
  .string()
  .trim()
  .refine((v) => paraE164(v) !== null, { error: "Celular inválido. Confira o país e o número." })
  .transform((v) => paraE164(v)!) // refine garante não-nulo
```

- **Saída sempre E.164** (`string`). `signupSchema`/`profileSchema` passam a expor `celular`
  já normalizado → o `signup` manda E.164 na metadata; `atualizarPerfil` grava E.164.
- **Retrocompat**: uma linha legada `11912345678` (sem `+`) normaliza para `+5511912345678`
  se reescrita pelo perfil; enquanto não reescrita, o `linkWhatsApp` ainda a resolve (abaixo).
- **Defesa em profundidade**: a action é um endpoint HTTP; o schema valida no servidor
  independentemente do client, então um POST cru com número inválido é rejeitado por campo.

## `PhoneField` (client) — compõe E.164 num input oculto

Padrão "input controlado + hidden" para **não tocar** o fluxo `<form action={formAction}>`:
a Server Action continua lendo `formData.get("celular")`, agora um E.164.

- Estado: `country: CountryCode` (default `"BR"`), `national: string` (texto digitado).
- Render: seletor de país **buscável** (Popover + Command do shadcn, se disponível; senão
  `Select`) exibindo `🇧🇷 +55` etc., e um `<Input type="tel">` com formatação ao vivo via
  `new AsYouType(country).input(national)`.
- Valor oculto: `<input type="hidden" name={name} value={e164} />`, com
  `e164 = "+" + getCountryCallingCode(country) + somenteDigitos(national)`. Construir a string
  (em vez de `parsePhoneNumber`) evita exceções com entrada parcial; a validade autoritativa é
  do schema no servidor (erros por campo já renderizados pelos forms).
- Inicialização por `defaultValue`:
  - começa com `+` → `parsePhoneNumber(defaultValue)`; usa `pn.country` e `pn.nationalNumber`.
  - não-vazio sem `+` (legado BR) → `country="BR"`, `national=defaultValue`.
  - vazio → `country="BR"`, `national=""`.
- **Lista de países**: `getCountries()` → ISO2; nome pt-BR via
  `new Intl.DisplayNames(["pt-BR"], { type: "region" })`; **Brasil fixado no topo** (+ atalhos
  comuns como Portugal), depois alfabético. Bandeira = dois indicadores regionais derivados do
  ISO2 (sem pacote de flags).
- **Acessibilidade**: `<Label htmlFor>` aponta ao input do número; o seletor de país tem
  `aria-label="País"`; `aria-invalid`/`aria-describedby` propagados ao input do número (erro por
  campo já existente). Alvos ≥ 44px (mobile-first).

## `linkWhatsApp` DDI-aware (retrocompatível)

```ts
export function linkWhatsApp(celular?: string | null, texto?: string): string | null {
  if (!celular) return null
  const bruto = celular.trim()
  const digitos = bruto.replace(/\D/g, "")
  let alvo: string | null = null
  if (bruto.startsWith("+")) {
    if (digitos.length >= 8 && digitos.length <= 15) alvo = digitos // E.164: DDI embutido
  } else if (digitos.length === 11) {
    alvo = `55${digitos}` // legado BR nacional
  } else if (digitos.length === 13 && digitos.startsWith("55")) {
    alvo = digitos // legado BR já com DDI
  }
  if (!alvo) return null
  const base = `https://wa.me/${alvo}`
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}
```

Preserva 100% do comportamento atual para entradas legadas; adiciona o ramo E.164. Como o
storage novo é sempre E.164 (`+…`), números novos caem no primeiro ramo; PT/US/etc. funcionam.

## Sem migração de banco

`users.celular text` permanece. Nenhum backfill: legados convergem para E.164 organicamente
quando o dono dos perfis os reedita. O `linkWhatsApp` cobre os dois mundos no meio-tempo.

## Riscos e mitigações

- **Bundle**: `libphonenumber-js` (~100KB min). Aceito pelo dono. Mitigação: metadata `min`,
  import default (não `max`/`mobile`); a validação no schema roda no servidor.
- **SSR/`Intl.DisplayNames`**: disponível em Node ≥ 18 e em todo browser-alvo; o `PhoneField` é
  `"use client"` e a lista é montada no cliente — sem risco de hidratação além do texto do país.
- **Entrada parcial → hidden inválido**: intencional; o servidor rejeita por campo, mensagem
  clara. Nenhum dado inválido chega ao banco.
- **PII inalterada**: `celular` segue restrito pela RPC `celulares_de_contato` (gate de
  co-participação). Mudar o formato para E.164 não amplia exposição.
