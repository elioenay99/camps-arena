"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Telemetria da Vercel (Analytics + Web Vitals) gated por rota: em TODAS as rotas
 * ela é montada como antes, EXCETO na subárvore pública `/demo`, onde o modo de
 * demonstração promete "nenhuma integração externa é acionada" (sem requests a
 * `va.vercel-scripts.com`). Comportamento fora de `/demo` fica idêntico.
 */
export function AnalyticsGate() {
  const pathname = usePathname();
  if (pathname?.startsWith("/demo")) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
