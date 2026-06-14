import type { CSSProperties } from "react";

/**
 * Tema por campeonato (change add-cores-campeonato).
 *
 * O elemento que recebe `champThemeProps` carrega as cores CRUAS como custom
 * properties inline (`--brand-primary`/`--brand-secondary`); o `globals.css`
 * deriva `--primary`/`--ring`/`--primary-foreground` por tema via
 * `oklch(from …)`. Não há `<div>` extra: as props são ESPALHADAS no elemento
 * que já existe (preserva a cadeia flex das `<main>`/cards).
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * Texto legível (claro/escuro) sobre uma cor sólida, por luminância relativa
 * (WCAG). Usado como fallback inline de `--primary-foreground` para navegadores
 * sem relative-color-syntax; o `@supports` em globals.css sobrescreve por tema.
 */
export function onColor(hex: string): string {
  const m = HEX6.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[0].slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return lum > 0.4 ? "#1c1d26" : "#ffffff";
}

export type ChampThemeProps = {
  className: string;
  style: CSSProperties;
};

/**
 * Props para espalhar no elemento existente. `null` quando não há cor (a página
 * usa o tema base do app). As cores devem chegar JÁ resolvidas pela herança
 * (divisão ?? competição ?? torneio) feita no data layer.
 */
export function champThemeProps(
  primary?: string | null,
  secondary?: string | null,
): ChampThemeProps | null {
  if (!primary && !secondary) return null;
  const vars: Record<string, string> = {};
  if (primary) vars["--brand-primary"] = primary;
  if (secondary) vars["--brand-secondary"] = secondary;
  // NÃO injetar --primary-foreground inline: uma custom property inline vence
  // QUALQUER regra de stylesheet (o @supports não dá especificidade extra), o
  // que sombrearia o foreground derivado por tema em globals.css e calcularia o
  // contraste sobre a cor CRUA (≠ da --primary normalizada) → reprova AA. O
  // foreground sai do .champ-theme por tema (caminho moderno) e, no fallback
  // sem relative-color, herda o --primary-foreground base do tema.
  return { className: "champ-theme", style: vars as CSSProperties };
}

/** Resolve a cor efetiva por herança: própria ?? herdada ?? null. */
export function resolverCores(
  proprio: { cor_primaria: string | null; cor_secundaria: string | null } | null | undefined,
  herdado?: { cor_primaria: string | null; cor_secundaria: string | null } | null,
): { primaria: string | null; secundaria: string | null } {
  return {
    primaria: proprio?.cor_primaria ?? herdado?.cor_primaria ?? null,
    secundaria: proprio?.cor_secundaria ?? herdado?.cor_secundaria ?? null,
  };
}
