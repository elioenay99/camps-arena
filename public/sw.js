// Service worker do Goliseu — PWA Fase 2 (offline).
// JS puro servido estático (Turbopack não processa public/). Contrato em
// openspec/changes/archive/<data>-add-pwa-offline. Princípio: NUNCA cachear HTML
// nem dados — só assets públicos de uma ALLOWLIST estrita; navegação offline cai
// em /offline.html. Isso fecha por construção o vazamento de PII (placares,
// avatares) para o Cache Storage do dispositivo.

// Ao mudar o conteúdo de /offline.html, BUMPAR esta versão (senão o `activate`
// não poda o precache antigo e a página offline fica desatualizada) E regenerar
// o hash CSP em next.config.ts (`offlineHtmlCsp`) se o <script> tiver mudado.
const VERSION = "goliseu-sw-v1";
const OFFLINE_URL = "/offline.html";

// Allowlist de cache: só caminhos públicos, imutáveis (hash) e sem PII.
const ICON_ALLOWLIST = ["/icon-192.png", "/icon-512.png", "/icon-maskable.png"];

function podeCachear(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      ICON_ALLOWLIST.includes(url.pathname))
  );
}

// Guard de gravação: 200 puro (não 206), resposta básica (same-origin), não
// redirecionada e sem no-store. Cinto-e-suspensórios — a allowlist já exclui
// quase tudo, mas o guard impede gravar lixo.
function gravavel(response) {
  return (
    response &&
    response.status === 200 &&
    response.type === "basic" &&
    !response.redirected &&
    !/no-store/.test(response.headers.get("Cache-Control") ?? "")
  );
}

self.addEventListener("install", (event) => {
  // Precache APENAS da página offline (item único, crítico): sem addAll, então
  // um blip de rede não derruba o install inteiro. Ícones entram sob demanda.
  event.waitUntil(caches.open(VERSION).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== VERSION).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Último recurso se /offline.html não estiver no cache (precache falho, poda por
// quota, storage limpo): um HTML mínimo — NUNCA um erro de rede (o dino).
function respostaOfflineSintetica() {
  const html =
    "<!doctype html><meta charset=utf-8><title>Offline — Goliseu</title>" +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;' +
    "justify-content:center;background:#282a36;color:#f8f8f2;text-align:center;" +
    'font-family:system-ui,sans-serif"><p>Você está offline.<br>' +
    '<a href="/" style="color:#bd93f9">Tentar novamente</a></p>';
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function fallbackNavegacao() {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(OFFLINE_URL);
  return cached ?? respostaOfflineSintetica();
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const rede = fetch(request)
    .then(async (response) => {
      // Aguarda a gravação (para o waitUntil cobri-la) e silencia quota.
      if (gravavel(response)) {
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    // Mantém o SW vivo até a revalidação terminar, mesmo respondendo do cache.
    event.waitUntil(rede);
    return cached;
  }
  return (await rede) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // (1) só GET — Server Actions/mutações (POST) passam direto.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // (2) cross-origin (Supabase, Storage, realtime, Sentry, analytics) — bypass.
  if (url.origin !== self.location.origin) return;

  // (3) payloads RSC — nunca servir/gravar um payload renderizado velho.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;

  // (4) navegação (HTML) — network-only + fallback offline; nunca cacheia HTML
  //     (preserva o nonce de CSP por request e não persiste PII no dispositivo).
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => fallbackNavegacao()));
    return;
  }

  // (5) allowlist estrita — stale-while-revalidate.
  if (podeCachear(url)) {
    event.respondWith(staleWhileRevalidate(event, request));
    return;
  }

  // (6) resto same-origin (/_next/image, /dashboard/.../imagem, route handlers,
  //     /auth/confirm, /icon.svg, apple-icon) — bypass, network-only, sem gravar.
});
