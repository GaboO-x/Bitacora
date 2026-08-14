// ============================================================================
// Gate de instalación obligatoria.
// Bloquea el uso de la app (overlay a pantalla completa, sin botón de cerrar)
// hasta que se detecta que corre como PWA instalada.
//
// Comportamiento por plataforma:
//  - Android / Chrome / Edge / desktop con soporte de beforeinstallprompt:
//    botón que dispara el prompt nativo del navegador.
//  - iOS (Safari y navegadores basados en WebKit, ya que Apple no expone
//    beforeinstallprompt): instrucciones ilustradas para "Compartir > Añadir
//    a inicio". Safari NO permite detectar la instalación desde la misma
//    pestaña (la pestaña del navegador sigue sin ser standalone aunque el
//    usuario ya haya agregado el ícono) — se le pide explícitamente cerrar
//    el navegador y abrir el ícono agregado.
//  - Navegadores de escritorio sin soporte de instalación (Firefox, Safari
//    macOS antiguo): no se les puede exigir instalación técnicamente
//    imposible en su navegador, así que se ofrece una salida explícita
//    ("Continuar en el navegador") con aviso claro, para no dejar a nadie
//    sin acceso.
//
// Uso: <script type="module" src="./js/install-gate.js"></script>
// en las páginas protegidas (app.html, admin.html).
// ============================================================================

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Si el overlay ya está pintado esperando el prompt (Android tardó en
  // disparar el evento), habilita el botón ahora.
  const btn = document.getElementById("ig-btn-install");
  if (btn) btn.disabled = false;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  hideGate();
});

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true // iOS Safari legacy
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ en modo desktop reporta MacIntel, se distingue por touch points.
  const isIPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIPadDesktopMode;
}

function isFirefox() {
  return /Firefox/.test(navigator.userAgent) && !/Seamonkey/.test(navigator.userAgent);
}

function isDesktopSafari() {
  const ua = navigator.userAgent;
  const isSafariUA = /^((?!chrome|android).)*safari/i.test(ua);
  return isSafariUA && !isIOS();
}

function supportsInstallPrompt() {
  // Chromium (Chrome, Edge, Brave, Opera, Samsung Internet) dispara beforeinstallprompt.
  // Firefox y Safari de escritorio no lo soportan.
  return !isFirefox() && !isDesktopSafari();
}

function injectStyles() {
  if (document.getElementById("ig-styles")) return;
  const style = document.createElement("style");
  style.id = "ig-styles";
  style.textContent = `
    #ig-overlay{
      position:fixed; inset:0; z-index:99999;
      display:flex; align-items:center; justify-content:center;
      background:var(--bg, var(--bg-main, #0b0d12));
      font-family:var(--font-sans, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif);
      padding:24px;
    }
    #ig-card{
      width:100%; max-width:420px;
      background:var(--panel, var(--card, #161a24));
      border:1px solid var(--line, rgba(255,255,255,.08));
      border-radius:var(--radius2, 18px);
      padding:28px 26px 24px;
      box-shadow:var(--shadow2, 0 10px 32px rgba(0,0,0,.35));
      text-align:center;
      color:var(--text, #EDE8DC);
    }
    #ig-card img{ width:76px; height:76px; border-radius:20px; margin-bottom:14px; }
    #ig-card h1{ font-size:19px; margin:0 0 8px; font-family:var(--font-serif, serif); }
    #ig-card p{ font-size:14px; line-height:1.5; color:var(--muted, #9098AC); margin:0 0 6px; }
    #ig-steps{ text-align:left; margin:18px 0; padding:0; list-style:none; }
    #ig-steps li{
      display:flex; gap:10px; align-items:flex-start;
      font-size:13.5px; color:var(--text, #EDE8DC); padding:8px 0;
      border-top:1px solid var(--line, rgba(255,255,255,.08));
    }
    #ig-steps li:first-child{ border-top:none; }
    #ig-steps .ig-num{
      flex:0 0 auto; width:22px; height:22px; border-radius:50%;
      background:var(--accent, #A60321); color:#fff; font-size:12px; font-weight:700;
      display:flex; align-items:center; justify-content:center;
    }
    #ig-btn-install, #ig-btn-fallback{
      width:100%; margin-top:8px; padding:12px 16px; border-radius:12px;
      border:none; background:var(--accent, #A60321); color:#fff;
      font-size:14.5px; font-weight:700; cursor:pointer;
    }
    #ig-btn-install:disabled{ opacity:.5; cursor:not-allowed; }
    #ig-btn-fallback{
      background:transparent; color:var(--muted, #9098AC);
      border:1px solid var(--line, rgba(255,255,255,.15)); font-weight:600;
      margin-top:10px; font-size:13px;
    }
    #ig-badge{
      display:inline-block; font-size:11px; font-weight:700; letter-spacing:.04em;
      text-transform:uppercase; color:var(--accent, #A60321);
      background:var(--accent-bg, rgba(166,3,33,.12));
      border-radius:999px; padding:4px 10px; margin-bottom:12px;
    }
  `;
  document.head.appendChild(style);
}

function iconUrl() {
  // La página que importa este módulo vive en la raíz del shell (app.html, admin.html).
  return "./icons/icon-192.png";
}

function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "ig-overlay";

  let stepsHtml = "";
  let actionsHtml = "";

  if (isIOS()) {
    stepsHtml = `
      <ol id="ig-steps">
        <li><span class="ig-num">1</span> Tocá el ícono <strong>Compartir</strong> (cuadro con flecha ↑) en la barra de Safari.</li>
        <li><span class="ig-num">2</span> Deslizá y elegí <strong>“Añadir a inicio”</strong>.</li>
        <li><span class="ig-num">3</span> Confirmá tocando <strong>“Añadir”</strong>.</li>
        <li><span class="ig-num">4</span> Cerrá esta pestaña y abrí <strong>Bitácora</strong> desde el ícono en tu pantalla de inicio.</li>
      </ol>
    `;
    actionsHtml = `<p style="margin-top:10px;font-size:12.5px;">iOS no permite confirmar la instalación automáticamente: una vez agregada, abrila desde el ícono.</p>`;
  } else if (supportsInstallPrompt()) {
    stepsHtml = `
      <ol id="ig-steps">
        <li><span class="ig-num">1</span> Tocá <strong>“Instalar aplicación”</strong> abajo.</li>
        <li><span class="ig-num">2</span> Confirmá en el diálogo del navegador.</li>
        <li><span class="ig-num">3</span> Abrí Bitácora desde el ícono instalado.</li>
      </ol>
    `;
    actionsHtml = `
      <button id="ig-btn-install" type="button" disabled>Instalar aplicación</button>
      <p id="ig-manual-hint" style="margin-top:10px;font-size:12px;">
        Si el botón no responde, abrí el menú ⋮ del navegador y elegí “Instalar aplicación” / “Agregar a pantalla de inicio”.
      </p>
    `;
  } else {
    // Navegador de escritorio sin soporte técnico de instalación (Firefox, Safari macOS antiguo, etc.)
    stepsHtml = `<p>Tu navegador actual no soporta instalación directa de aplicaciones web.</p>`;
    actionsHtml = `
      <p style="font-size:12.5px;">Recomendado: abrí este sitio con <strong>Chrome</strong> o <strong>Edge</strong> para instalar Bitácora como app de escritorio.</p>
      <button id="ig-btn-fallback" type="button">Continuar en el navegador por ahora</button>
    `;
  }

  overlay.innerHTML = `
    <div id="ig-card">
      <img src="${iconUrl()}" alt="Bitácora" />
      <span id="ig-badge">Instalación requerida</span>
      <h1>Instalá Bitácora para continuar</h1>
      <p>Esta app funciona como una aplicación instalada en tu dispositivo, con acceso más rápido y seguro.</p>
      ${stepsHtml}
      ${actionsHtml}
    </div>
  `;

  document.documentElement.appendChild(overlay);

  const installBtn = document.getElementById("ig-btn-install");
  if (installBtn) {
    if (deferredPrompt) installBtn.disabled = false;
    installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      installBtn.disabled = true;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome !== "accepted") {
        installBtn.disabled = false; // el usuario canceló el diálogo, puede reintentar
      }
      // Si acepta, 'appinstalled' dispara hideGate().
    });
  }

  const fallbackBtn = document.getElementById("ig-btn-fallback");
  if (fallbackBtn) {
    fallbackBtn.addEventListener("click", () => {
      try { sessionStorage.setItem("bitacora_install_bypass", "1"); } catch {}
      hideGate();
    });
  }
}

function hideGate() {
  const overlay = document.getElementById("ig-overlay");
  if (overlay) overlay.remove();
  document.documentElement.style.overflow = "";
}

export function enforceInstallGate() {
  if (isStandalone()) return; // ya corre instalada, no hay nada que hacer

  let bypass = false;
  try { bypass = sessionStorage.getItem("bitacora_install_bypass") === "1"; } catch {}
  if (bypass) return; // solo aplica a navegadores de escritorio sin soporte técnico (ver rama else arriba)

  injectStyles();
  document.documentElement.style.overflow = "hidden";

  const paint = () => buildOverlay();
  if (document.body) paint();
  else document.addEventListener("DOMContentLoaded", paint);
}

enforceInstallGate();
