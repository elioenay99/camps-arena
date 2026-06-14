import { z } from "zod";

/**
 * Cor hex `#rrggbb`. Aceita maiúsculas no input e normaliza para minúsculo, p/
 * casar com o CHECK do banco (`^#[0-9a-f]{6}$`). change add-cores-campeonato.
 */
export const corHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #rrggbb.")
  .transform((s) => s.toLowerCase());

/**
 * Cor opcional vinda de formulário: string vazia / ausente ⇒ `undefined`
 * (sem cor = herda o nível acima ou usa o tema base do app).
 */
export const corOpcional = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  corHex.optional(),
);

/** Par de cores opcionais (primária + secundária). */
export const coresOpcionais = z.object({
  corPrimaria: corOpcional,
  corSecundaria: corOpcional,
});

export type CoresInput = z.infer<typeof coresOpcionais>;
