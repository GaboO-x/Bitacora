// ============================================================================
// Módulo compartido de instalación PWA.
// Única fuente de verdad para: detección de plataforma, estilos y el markup
// de la "tarjeta de instalación". La usan tanto install-gate.js (bloqueante,
// pantalla completa) como install-button.js (banner en el login) para que
// ambos se vean IDÉNTICOS — mismo componente, dos contextos distintos.
// ============================================================================

// ---- Detección de plataforma / soporte ----

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true // iOS Safari legacy
  );
}

export function isIOS() {
  const ua = navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ en modo desktop reporta MacIntel, se distingue por touch points.
  const isIPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIPadDesktopMode;
}

export function isFirefox() {
  return /Firefox/.test(navigator.userAgent) && !/Seamonkey/.test(navigator.userAgent);
}

export function isDesktopSafari() {
  const isSafariUA = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return isSafariUA && !isIOS();
}

export function supportsInstallPrompt() {
  // Chromium (Chrome, Edge, Brave, Opera, Samsung Internet) dispara beforeinstallprompt.
  // Firefox y Safari de escritorio no lo soportan.
  return !isFirefox() && !isDesktopSafari();
}

// ---- Bypass de desarrollo ----
// Evita el gate/banner mientras se trabaja localmente (VS Code + Live Server,
// http://localhost o 127.0.0.1) o en un preview público (GitHub Pages, etc.)
// agregando una vez "?nogate=1" a la URL — queda activo el resto de la
// pestaña (sessionStorage), no hace falta repetirlo en cada clic.
export function isDevBypass() {
  const host = location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "" || host === "[::1]";
  if (isLocalHost) return true;

  try {
    const params = new URLSearchParams(location.search);
    if (params.get("nogate") === "1") {
      sessionStorage.setItem("bitacora_dev_bypass", "1");
    }
    return sessionStorage.getItem("bitacora_dev_bypass") === "1";
  } catch {
    return false;
  }
}

// ---- Prompt nativo de instalación (compartido, un solo listener global) ----

let deferredPrompt = null;
const availableCallbacks = [];
const installedCallbacks = [];

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  availableCallbacks.forEach((cb) => cb());
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  installedCallbacks.forEach((cb) => cb());
});

export function onPromptAvailable(cb) {
  availableCallbacks.push(cb);
  if (deferredPrompt) cb(); // ya estaba disponible antes de suscribirse
}

export function onInstalled(cb) {
  installedCallbacks.push(cb);
}

export async function triggerInstallPrompt() {
  if (!deferredPrompt) return null;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome;
}

export function hasDeferredPrompt() {
  return !!deferredPrompt;
}

// ---- Estilos (una sola vez por documento) ----

export function injectInstallStyles() {
  if (document.getElementById("pwa-ic-styles")) return;
  const style = document.createElement("style");
  style.id = "pwa-ic-styles";
  style.textContent = `
    .pwa-ic-overlay{
      position:fixed; inset:0; z-index:99999;
      display:flex; align-items:center; justify-content:center;
      background:var(--bg, var(--bg-main, #0b0d12));
      padding:24px;
    }
    .pwa-ic-card{
      width:100%; max-width:420px;
      font-family:var(--font-sans, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif);
      background:var(--panel, var(--card, #fff));
      border:1px solid var(--line, #E8DDD0);
      border-radius:var(--radius2, 18px);
      padding:28px 26px 24px;
      box-shadow:var(--shadow2, 0 10px 32px rgba(0,0,0,.12));
      text-align:center;
      color:var(--text, #34271F);
    }
    .pwa-ic-card.pwa-ic-inline{ box-shadow:none; padding:20px 18px 18px; margin:14px 0 4px; }
    .pwa-ic-card img{ width:64px; height:64px; border-radius:16px; margin-bottom:12px; }
    .pwa-ic-card h1{ font-size:18px; margin:0 0 8px; font-family:var(--font-serif, serif); }
    .pwa-ic-card p{ font-size:13.5px; line-height:1.5; color:var(--muted, #A08C76); margin:0 0 6px; }
    .pwa-ic-steps{ text-align:left; margin:16px 0; padding:0; list-style:none; }
    .pwa-ic-steps li{
      display:flex; gap:10px; align-items:flex-start;
      font-size:13px; color:var(--text, #34271F); padding:8px 0;
      border-top:1px solid var(--line, #E8DDD0);
    }
    .pwa-ic-steps li:first-child{ border-top:none; }
    .pwa-ic-num{
      flex:0 0 auto; width:22px; height:22px; border-radius:50%;
      background:var(--accent, #A60321); color:#fff; font-size:12px; font-weight:700;
      display:flex; align-items:center; justify-content:center;
    }
    .pwa-ic-btn, .pwa-ic-btn-outline{
      width:100%; margin-top:8px; padding:12px 16px; border-radius:12px;
      border:none; background:var(--accent, #A60321); color:#fff;
      font-size:14px; font-weight:700; cursor:pointer;
    }
    .pwa-ic-btn:disabled{ opacity:.5; cursor:not-allowed; }
    .pwa-ic-btn-outline{
      background:transparent; color:var(--muted, #A08C76);
      border:1px solid var(--line, #E8DDD0); font-weight:600;
      margin-top:10px; font-size:12.5px;
    }
    .pwa-ic-badge{
      display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.04em;
      text-transform:uppercase; color:var(--accent, #A60321);
      background:var(--accent-bg, rgba(166,3,33,.1));
      border-radius:999px; padding:4px 10px; margin-bottom:12px;
    }
    .pwa-ic-hint{ margin-top:10px; font-size:11.5px; color:var(--muted, #A08C76); }
    .pwa-ic-installed h1{ color:#0a3d12; }
  `;
  document.head.appendChild(style);
}

// ---- Markup de la tarjeta (idéntico en gate y banner) ----

/**
 * @param {object} opts
 * @param {string} opts.iconSrc          Ruta al ícono (relativa a la página que monta esto)
 * @param {boolean} opts.blocking        true = copy del gate ("para continuar"), false = copy del banner de invitación
 * @param {boolean} opts.allowContinue   Solo aplica a navegadores sin soporte técnico: ofrece salida
 */
export function buildInstallCardHTML({ iconSrc, blocking, allowContinue }) {
  let stepsHtml = "";
  let actionsHtml = "";

  if (isIOS()) {
    stepsHtml = `
      <ol class="pwa-ic-steps">
        <li><span class="pwa-ic-num">1</span> Tocá el ícono <strong>Compartir</strong> (cuadro con flecha ↑) en Safari.</li>
        <li><span class="pwa-ic-num">2</span> Elegí <strong>“Añadir a inicio”</strong>.</li>
        <li><span class="pwa-ic-num">3</span> Confirmá tocando <strong>“Añadir”</strong>.</li>
        <li><span class="pwa-ic-num">4</span> Abrí <strong>Bitácora</strong> desde el ícono en tu pantalla de inicio.</li>
      </ol>
    `;
    actionsHtml = `<p class="pwa-ic-hint">iOS no permite confirmar la instalación automáticamente: una vez agregada, abrila desde el ícono.</p>`;
  } else if (supportsInstallPrompt()) {
    stepsHtml = `
      <ol class="pwa-ic-steps">
        <li><span class="pwa-ic-num">1</span> Tocá <strong>“Instalar aplicación”</strong> abajo.</li>
        <li><span class="pwa-ic-num">2</span> Confirmá en el diálogo del navegador.</li>
        <li><span class="pwa-ic-num">3</span> Abrí Bitácora desde el ícono instalado.</li>
      </ol>
    `;
    actionsHtml = `
      <button class="pwa-ic-btn" id="pwa-ic-btn-install" type="button" disabled>Instalar aplicación</button>
      <p class="pwa-ic-hint">Si el botón no responde, abrí el menú ⋮ del navegador y elegí “Instalar aplicación” / “Agregar a pantalla de inicio”.</p>
    `;
  } else {
    stepsHtml = `<p>Tu navegador actual no soporta instalación directa de aplicaciones web.</p>`;
    actionsHtml = `
      <p class="pwa-ic-hint">Recomendado: abrí este sitio con <strong>Chrome</strong> o <strong>Edge</strong> para instalar Bitácora.</p>
      ${allowContinue ? `<button class="pwa-ic-btn-outline" id="pwa-ic-btn-fallback" type="button">Continuar en el navegador por ahora</button>` : ""}
    `;
  }

  const heading = blocking ? "Instalá Bitácora para continuar" : "Instalá Bitácora";
  const sub = blocking
    ? "Esta app funciona como una aplicación instalada en tu dispositivo, con acceso más rápido y seguro."
    : "Acceso rápido, funciona sin conexión.";

  return `
    <img src="${iconSrc}" alt="Bitácora" />
    ${blocking ? `<span class="pwa-ic-badge">Instalación requerida</span>` : ""}
    <h1>${heading}</h1>
    <p>${sub}</p>
    ${stepsHtml}
    ${actionsHtml}
  `;
}

/**
 * Pinta la tarjeta dentro de `container` y conecta los botones.
 * @param {HTMLElement} container
 * @param {object} opts  { iconSrc, blocking, allowContinue, onContinue, inline }
 */
export function mountInstallCard(container, opts) {
  injectInstallStyles();
  container.classList.add("pwa-ic-card");
  if (opts.inline) container.classList.add("pwa-ic-inline");
  container.innerHTML = buildInstallCardHTML(opts);

  const installBtn = container.querySelector("#pwa-ic-btn-install");
  if (installBtn) {
    if (hasDeferredPrompt()) installBtn.disabled = false;
    onPromptAvailable(() => { installBtn.disabled = false; });
    installBtn.addEventListener("click", async () => {
      installBtn.disabled = true;
      const outcome = await triggerInstallPrompt();
      if (outcome !== "accepted") installBtn.disabled = false;
    });
  }

  const fallbackBtn = container.querySelector("#pwa-ic-btn-fallback");
  if (fallbackBtn && opts.onContinue) {
    fallbackBtn.addEventListener("click", opts.onContinue);
  }

  return container;
}
