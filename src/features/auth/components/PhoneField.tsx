"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const PAIS_PADRAO: CountryCode = "BR"
/** Fixados no topo da lista (público majoritário BR + convidados de Portugal). */
const FIXADOS: readonly CountryCode[] = ["BR", "PT"]

const NOMES_REGIAO = new Intl.DisplayNames(["pt-BR"], { type: "region" })

/** Nome do país em pt-BR; cai para o código ISO se o runtime não souber. */
function nomePais(code: CountryCode): string {
  try {
    return NOMES_REGIAO.of(code) ?? code
  } catch {
    return code
  }
}

/** Bandeira via os dois Regional Indicator Symbols do ISO2 (sem assets). */
function bandeira(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)))
}

type Pais = { code: CountryCode; nome: string; ddi: string }

/** Lista completa: fixados no topo, depois alfabética por nome pt-BR. */
function listarPaises(): Pais[] {
  const todos: Pais[] = getCountries().map((code) => ({
    code,
    nome: nomePais(code),
    ddi: getCountryCallingCode(code),
  }))
  const fixados = FIXADOS.map((c) => todos.find((p) => p.code === c)).filter(
    (p): p is Pais => Boolean(p)
  )
  const resto = todos
    .filter((p) => !FIXADOS.includes(p.code))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  return [...fixados, ...resto]
}

/**
 * Deriva país + número nacional de um `defaultValue` (E.164 com `+`, ou legado
 * BR sem DDI). Usa o parser NÃO-lançador e cai para o país padrão quando o
 * número não resolve um país (ex.: NANP) — mantendo o tipo `CountryCode`.
 */
function estadoInicial(defaultValue?: string | null): {
  country: CountryCode
  national: string
} {
  const v = defaultValue?.trim()
  if (!v) return { country: PAIS_PADRAO, national: "" }
  const pn = parsePhoneNumberFromString(v, v.startsWith("+") ? undefined : PAIS_PADRAO)
  if (pn) {
    return {
      country: pn.country ?? PAIS_PADRAO,
      national: new AsYouType(pn.country ?? PAIS_PADRAO).input(pn.nationalNumber),
    }
  }
  return { country: PAIS_PADRAO, national: v.replace(/\D/g, "") }
}

/**
 * Campo de celular internacional. Seletor de país buscável (padrão Brasil) +
 * número com formatação ao vivo (`AsYouType`). Compõe o E.164 num
 * `<input type="hidden" name={name}>`, preservando o fluxo FormData/Server
 * Action (a action segue lendo `formData.get(name)`, agora um E.164). A
 * validade autoritativa é do schema no servidor.
 */
export function PhoneField({
  name,
  defaultValue,
  id = "celular",
  required,
  ariaInvalid,
  ariaDescribedBy,
}: {
  name: string
  defaultValue?: string | null
  id?: string
  required?: boolean
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}) {
  const inicial = useMemo(() => estadoInicial(defaultValue), [defaultValue])
  const [country, setCountry] = useState<CountryCode>(inicial.country)
  const [national, setNational] = useState(inicial.national)
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState("")

  const paises = useMemo(() => listarPaises(), [])
  const ddi = getCountryCallingCode(country)
  const digitos = national.replace(/\D/g, "")
  // E.164 CANÔNICO: deixa a lib normalizar (remove trunk-prefix nacional, etc.).
  // Número parcial/incompleto cai no fallback ingênuo — a validade autoritativa
  // é do schema no servidor, que reparseia este mesmo valor.
  const e164 = digitos
    ? (parsePhoneNumberFromString(national, country)?.number ?? `+${ddi}${digitos}`)
    : ""

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return paises
    const semMais = q.replace(/^\+/, "")
    return paises.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.ddi.startsWith(semMais) ||
        p.code.toLowerCase() === q
    )
  }, [busca, paises])

  function aoDigitar(e: React.ChangeEvent<HTMLInputElement>) {
    setNational(new AsYouType(country).input(e.target.value))
  }

  function escolher(p: Pais) {
    setCountry(p.code)
    // Reformata o número que já estava no campo para a máscara do novo país.
    setNational(new AsYouType(p.code).input(digitos))
    setAberto(false)
    setBusca("")
  }

  return (
    <div className="flex gap-2">
      <input type="hidden" name={name} value={e164} />

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`País: ${nomePais(country)} (+${ddi})`}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm dark:bg-input/30"
            )}
          >
            <span aria-hidden="true" className="text-base leading-none">
              {bandeira(country)}
            </span>
            <span className="tabular-nums">+{ddi}</span>
            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
          </button>
        </DialogTrigger>
        <DialogContent className="gap-3">
          <DialogHeader>
            <DialogTitle>Escolha o país</DialogTitle>
            <DialogDescription className="sr-only">
              Busque e selecione o país do seu número de celular.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <Input
              autoFocus
              type="search"
              inputMode="search"
              placeholder="Buscar país ou DDI"
              aria-label="Buscar país"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <ul className="-mx-1 max-h-72 overflow-y-auto">
              {filtrados.map((p) => (
                <li key={p.code}>
                  <button
                    type="button"
                    onClick={() => escolher(p)}
                    aria-current={p.code === country ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      p.code === country && "bg-accent/60"
                    )}
                  >
                  <span aria-hidden="true" className="text-base leading-none">
                    {bandeira(p.code)}
                  </span>
                  <span className="flex-1 truncate">{p.nome}</span>
                  <span className="text-muted-foreground tabular-nums">+{p.ddi}</span>
                </button>
              </li>
            ))}
            {filtrados.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum país encontrado.
              </li>
            )}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={country === "BR" ? "(11) 91234-5678" : "Número de celular"}
        value={national}
        onChange={aoDigitar}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="flex-1"
      />
    </div>
  )
}
