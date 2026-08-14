// ============================================================================
// Registro del Service Worker + banner de "actualización disponible".
// No recarga la página automáticamente: el usuario confirma para no perder
// texto sin guardar (notas, formularios de admin, etc.).
// Se importa como <script type="module" src="./js/sw-update.js"></script>
// en cada página del shell.
// ============================================================================

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // revisa cada 5 min si hay app abierta

function injectBannerStyles() {
  if (document.getElementById("sw-update-styles")) return;
  const style = document.createElement("style");
  style.id = "sw-update-styles";
  style.textContent = `
    #sw-update-banner{
      position:fixed; left:0; right:0; bottom:0; z-index:9999;
      display:none; align-items:center; justify-content:center; gap:12px;
      flex-wrap:wrap; padding:12px 16px;
      background:var(--sw-banner-bg,#111); color:var(--sw-banner-fg,#fff);
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      font-size:14px; box-shadow:0 -2px 12px rgba(0,0,0,.25);
      animation:sw-slide-up .25s ease-out;
    }
    #sw-update-banner.show{display:flex}
    #sw-update-banner button{
      border:1px solid rgba(255,255,255,.35); background:#fff; color:#111;
      border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600;
      cursor:pointer;
    }
    @keyframes sw-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
  `;
  document.head.appendChild(style);
}

function showUpdateBanner(onReload) {
  injectBannerStyles();
  let banner = document.getElementById("sw-update-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "sw-update-banner";
    banner.innerHTML = `
      <span>Hay una nueva versión de Bitácora disponible.</span>
      <button type="button" id="sw-update-btn">Actualizar ahora</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector("#sw-update-btn").addEventListener("click", onReload);
  }
  banner.classList.add("show");
}

export function registerServiceWorkerWithUpdates() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("No se pudo registrar el Service Worker:", e);
      return;
    }

    // Evita doble reload si dos pestañas piden skipWaiting a la vez.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const promptUpdate = (worker) => {
      showUpdateBanner(() => {
        worker.postMessage({ type: "SKIP_WAITING" });
      });
    };

    // Caso 1: ya hay un SW esperando cuando cargamos (actualización perdida en otra pestaña).
    if (reg.waiting) promptUpdate(reg.waiting);

    // Caso 2: se detecta una nueva versión mientras la app está abierta.
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          promptUpdate(newWorker);
        }
      });
    });

    // Revisión activa: el navegador solo chequea updates en navegación normal;
    // forzamos revisión periódica y al volver a la pestaña, para no depender
    // de que el usuario recargue manualmente.
    setInterval(() => reg.update().catch(() => {}), CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  });
}

// Auto-ejecuta al importar: los <script type="module" src="./js/sw-update.js">
// en cada página del shell no necesitan boilerplate adicional.
registerServiceWorkerWithUpdates();
