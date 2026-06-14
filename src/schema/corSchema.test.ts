import { describe, expect, it } from "vitest";

import { corHex, corOpcional } from "@/schema/corSchema";

describe("corHex", () => {
  it("aceita #rrggbb e normaliza para minúsculo", () => {
    expect(corHex.parse("#aabbcc")).toBe("#aabbcc");
    expect(corHex.parse("#AABBCC")).toBe("#aabbcc"); // casa com o CHECK minúsculo do banco
    expect(corHex.parse("#1F6Fd6")).toBe("#1f6fd6");
  });

  it("rejeita formatos inválidos", () => {
    for (const v of ["#abc", "red", "#xyz123", "aabbcc", "#aabbccdd", ""]) {
      expect(corHex.safeParse(v).success).toBe(false);
    }
  });
});

describe("corOpcional", () => {
  it("vazio/null/undefined ⇒ undefined (herda/tema base)", () => {
    expect(corOpcional.parse("")).toBeUndefined();
    expect(corOpcional.parse(null)).toBeUndefined();
    expect(corOpcional.parse(undefined)).toBeUndefined();
  });

  it("hex válido passa (normalizado)", () => {
    expect(corOpcional.parse("#AABBCC")).toBe("#aabbcc");
  });

  it("hex inválido falha", () => {
    expect(corOpcional.safeParse("#zz0000").success).toBe(false);
  });
});
