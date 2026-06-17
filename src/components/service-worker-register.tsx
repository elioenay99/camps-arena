"use client";

import { useEffect } from "react";

// Registra o service worker (PWA Fase 2) APENAS em produção — em dev o cache do
// SW atrapalharia o hot-reload. O SW vive em `public/sw.js`; a estratégia de
// cache e o fallback offline estão lá. Registro é progressive enhancement: se
// falhar, o app segue normal (só sem a camada offline).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Silencioso: a ausência do SW não pode quebrar a navegação.
      });
  }, []);

  return null;
}
