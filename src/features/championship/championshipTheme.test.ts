import { describe, expect, it } from "vitest";

import {
  champThemeProps,
  onColor,
  resolverCores,
} from "@/features/championship/championshipTheme";

describe("resolverCores (herança divisão ?? competição)", () => {
  const azul = { cor_primaria: "#1f6fd6", cor_secundaria: "#0b3d91" };
  const ouro = { cor_primaria: "#f5b800", cor_secundaria: "#7a5b00" };

  it("usa as cores próprias quando definidas", () => {
    expect(resolverCores(azul, ouro)).toEqual({
      primaria: "#1f6fd6",
      secundaria: "#0b3d91",
    });
  });

  it("herda do nível acima quando a própria é null", () => {
    expect(
      resolverCores({ cor_primaria: null, cor_secundaria: null }, ouro),
    ).toEqual({ primaria: "#f5b800", secundaria: "#7a5b00" });
  });

  it("herda por campo (primária própria, secundária herdada)", () => {
    expect(
      resolverCores({ cor_primaria: "#1f6fd6", cor_secundaria: null }, ouro),
    ).toEqual({ primaria: "#1f6fd6", secundaria: "#7a5b00" });
  });

  it("sem cor em lugar nenhum ⇒ null/null (tema base)", () => {
    expect(resolverCores(null, null)).toEqual({
      primaria: null,
      secundaria: null,
    });
    expect(
      resolverCores({ cor_primaria: null, cor_secundaria: null }, undefined),
    ).toEqual({ primaria: null, secundaria: null });
  });
});

describe("onColor (texto legível por luminância)", () => {
  it("cor clara ⇒ texto escuro", () => {
    expect(onColor("#ffffff")).toBe("#1c1d26");
    expect(onColor("#ffb300")).toBe("#1c1d26");
  });

  it("cor escura ⇒ texto branco", () => {
    expect(onColor("#000000")).toBe("#ffffff");
    expect(onColor("#1f6fd6")).toBe("#ffffff");
  });

  it("entrada inválida ⇒ branco (fallback seguro)", () => {
    expect(onColor("nao-hex")).toBe("#ffffff");
  });
});

describe("champThemeProps", () => {
  it("sem cores ⇒ null (usa tema base)", () => {
    expect(champThemeProps(null, null)).toBeNull();
    expect(champThemeProps(undefined, undefined)).toBeNull();
  });

  it("com primária injeta --brand-primary + --primary-foreground", () => {
    const props = champThemeProps("#1f6fd6", null);
    expect(props?.className).toBe("champ-theme");
    const style = props?.style as Record<string, string>;
    expect(style["--brand-primary"]).toBe("#1f6fd6");
    // --primary-foreground NÃO é inline (sombrearia o @supports por tema e
    // quebraria o contraste AA); o globals.css o deriva por tema.
    expect(style["--primary-foreground"]).toBeUndefined();
    expect(style["--brand-secondary"]).toBeUndefined();
  });

  it("só secundária injeta --brand-secondary (sem --brand-primary)", () => {
    const style = champThemeProps(null, "#f5b800")?.style as Record<
      string,
      string
    >;
    expect(style["--brand-secondary"]).toBe("#f5b800");
    expect(style["--brand-primary"]).toBeUndefined();
  });
});
