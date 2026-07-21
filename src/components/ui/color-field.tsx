"use client";

import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export type ColorFieldProps = {
  label: string;
  /** Nome p/ submit via FormData (forms nativos). Opcional. */
  name?: string;
  /** Valor controlado: hex `#rrggbb` ou string vazia (sem cor). */
  value: string;
  onChange: (hex: string) => void;
  description?: string;
};

/**
 * Campo de cor controlado (não usa react-hook-form — os forms do app são
 * FormData nativo / estado local). O campo HEX textual é o controle primário
 * acessível; o `<input type="color">` é um atalho visual que abre o picker do
 * SO. change add-cores-campeonato.
 */
export function ColorField({
  label,
  name,
  value,
  onChange,
  description,
}: ColorFieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const erroId = `${id}-erro`;
  const valido = value === "" || HEX6.test(value);
  const swatch = HEX6.test(value) ? value : "#888888";
  // aria-describedby aponta erro (quando inválido) + descrição (quando houver).
  const describedBy =
    [!valido ? erroId : null, description ? descId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: seletor de cor`}
          value={swatch}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          // Alvo de toque ≥44px no mobile (swatch era 36px); compacto em md+.
          className="border-input h-11 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-1 md:h-9 md:w-10"
        />
        <input
          id={id}
          name={name}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="#aabbcc"
          value={value}
          aria-invalid={!valido}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "border-input focus-visible:ring-ring h-11 w-full rounded-md border bg-transparent px-3 font-mono text-base uppercase outline-none focus-visible:ring-2 md:h-9 md:text-sm",
            !valido && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-11 shrink-0 items-center text-xs underline-offset-2 hover:underline md:min-h-0"
          >
            limpar
          </button>
        )}
      </div>
      {!valido && (
        <p id={erroId} role="alert" className="text-destructive text-xs">
          Use uma cor no formato #rrggbb.
        </p>
      )}
      {description && (
        <p id={descId} className="text-muted-foreground text-xs">
          {description}
        </p>
      )}
    </div>
  );
}
