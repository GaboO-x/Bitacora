// ============================================================================
// Bitácora — Service Worker
// Estrategia: network-first para el "app shell" (HTML/CSS/JS) => el usuario
// siempre recibe la última versión cuando hay conexión. Cache-first solo para
// assets pesados/estáticos (iconos). El SW NUNCA activa una versión nueva por
// su cuenta mientras el usuario tiene la app abierta: espera un mensaje
// explícito ('SKIP_WAITING') que dispara la UI (ver js/sw-update.js), para
// evitar perder texto sin guardar en medio de una actualización.
// ============================================================================

// Sube este número en cada release. Cambiar la versión invalida el caché viejo.
const SW_VERSION = "1.0.3";
const CACHE_NAME = `bitacora-shell-v${SW_VERSION}`;

// Archivos del "app shell": lo mínimo para que la app cargue offline.
const SHELL_FILES = [
  "./index.html",
  "./app.html",
  "./admin.html",
  "./Bitacora_index.html",
  "./reset-password.html",
  "./manifest.json",
  "./css/styles.css",
  "./css/app.css",
  "./js/shared.js",
  "./js/config.js",
  "./js/app.js",
  "./js/admin.js",
  "./js/sw-update.js",
  "./js/install-ui.js",
  "./js/install-gate.js",
  "./js/install-button.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon-32.png",
];

// ---- INSTALL: precachea el shell de la nueva versión, pero NO toma control aún ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll falla entero si un solo archivo 404; los agregamos uno por uno
      // para que un asset opcional roto no tumbe todo el precache.
      await Promise.all(
        SHELL_FILES.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res.ok) await cache.put(url, res.clone());
          } catch (e) {
            // Sin red durante el install: no es fatal, se cachea on-demand luego.
          }
        })
      );
      // NO se llama self.skipWaiting() aquí. El SW nuevo queda "waiting"
      // hasta que el cliente confirme (ver mensaje SKIP_WAITING más abajo).
    })()
  );
});

// ---- ACTIVATE: limpia cachés de versiones anteriores ----
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("bitacora-shell-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // Avisa a todas las pestañas abiertas que ya hay una versión activa nueva.
      const clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach((c) => c.postMessage({ type: "SW_ACTIVATED", version: SW_VERSION }));
    })()
  );
});

// ---- MESSAGE: el cliente pide activar la versión en espera ----
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---- FETCH: estrategia por tipo de recurso ----
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return; // deja pasar CDN externos (fonts, supabase-js, etc.) sin interceptar

  const isDoc = req.mode === "navigate" || req.destination === "document";
  const isCodeOrStyle = ["script", "style"].includes(req.destination) || url.pathname.endsWith(".js") || url.pathname.endsWith(".css");
  const isImage = req.destination === "image";

  if (isDoc || isCodeOrStyle) {
    // Network-first: intenta traer la versión más nueva; cae a caché si no hay red.
    event.respondWith(networkFirst(req));
  } else if (isImage) {
    // Cache-first: iconos casi no cambian, prioriza velocidad/offline.
    event.respondWith(cacheFirst(req));
  }
  // Otros recursos (manifest, fuentes, etc.): sin interceptar, comportamiento normal del navegador.
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(req, { cache: "no-cache" });
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh.ok) cache.put(req, fresh.clone());
  return fresh;
}
