// ============================================================================
// Botón de instalación visible (página de login).
// A diferencia de install-gate.js, este NO bloquea nada: es un botón/tarjeta
// destacada que invita a instalar. Se auto-oculta si la app ya corre instalada.
// Uso: <script type="module" src="./js/install-button.js"></script>
// ============================================================================

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("ib-btn");
  if (btn) btn.disabled = false;
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  renderInstalledState();
  toggleLoginSection(true);
});

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  const isIPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleTouch || isIPadDesktopMode;
}

function isFirefox() {
  return /Firefox/.test(navigator.userAgent) && !/Seamonkey/.test(navigator.userAgent);
}

function isDesktopSafari() {
  const isSafariUA = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return isSafariUA && !isIOS();
}

function supportsInstallPrompt() {
  return !isFirefox() && !isDesktopSafari() && !isIOS();
}

function injectStyles() {
  if (document.getElementById("ib-styles")) return;
  const style = document.createElement("style");
  style.id = "ib-styles";
  style.textContent = `
    #ib-box{
      display:flex; align-items:center; gap:12px;
      background:#fff8f2; border:1px solid #f0dcc9; border-radius:12px;
      padding:12px 14px; margin:14px 0 4px;
    }
    #ib-box img{ width:38px; height:38px; border-radius:9px; flex:0 0 auto; }
    #ib-box .ib-text{ flex:1 1 auto; }
    #ib-box .ib-text strong{ display:block; font-size:13.5px; color:#34271F; }
    #ib-box .ib-text span{ display:block; font-size:12px; color:#8a7562; margin-top:1px; }
    #ib-btn{
      flex:0 0 auto; border:none; background:#A60321; color:#fff;
      border-radius:9px; padding:9px 14px; font-size:13px; font-weight:700;
      cursor:pointer; white-space:nowrap;
    }
    #ib-btn:disabled{ opacity:.55; cursor:progress; }
    #ib-box.ib-installed{ background:#eefaf0; border-color:#bfe8c6; }
    #ib-box.ib-installed .ib-text strong{ color:#0a3d12; }

    #ib-modal-backdrop{
      position:fixed; inset:0; background:rgba(20,14,10,.55); z-index:9998;
      display:flex; align-items:center; justify-content:center; padding:20px;
    }
    #ib-modal{
      background:#fff; border-radius:16px; max-width:360px; width:100%;
      padding:20px 20px 16px; box-shadow:0 12px 40px rgba(0,0,0,.25);
    }
    #ib-modal h3{ margin:0 0 10px; font-size:16px; color:#34271F; }
    #ib-modal ol{ margin:0 0 14px; padding-left:18px; font-size:13.5px; color:#34271F; line-height:1.6; }
    #ib-modal button{
      width:100%; border:none; background:#A60321; color:#fff; border-radius:9px;
      padding:10px; font-size:14px; font-weight:700; cursor:pointer;
    }
  `;
  document.head.appendChild(style);
}

function toggleLoginSection(show) {
  const el = document.getElementById("login-section");
  if (el) el.style.display = show ? "" : "none";
}

function renderInstalledState() {
  const box = document.getElementById("ib-box");
  if (!box) return;
  box.classList.add("ib-installed");
  box.innerHTML = `
    <img src="./icons/icon-192.png" alt="" />
    <div class="ib-text"><strong>Bitácora instalada ✓</strong><span>Ya tenés acceso rápido desde tu dispositivo.</span></div>
  `;
}

function openIOSModal() {
  const backdrop = document.createElement("div");
  backdrop.id = "ib-modal-backdrop";
  backdrop.innerHTML = `
    <div id="ib-modal">
      <h3>Instalar en iPhone / iPad</h3>
      <ol>
        <li>Tocá el ícono <strong>Compartir</strong> (cuadro con flecha ↑) en Safari.</li>
        <li>Elegí <strong>“Añadir a inicio”</strong>.</li>
        <li>Tocá <strong>“Añadir”</strong>.</li>
        <li>Abrí Bitácora desde el ícono en tu pantalla de inicio.</li>
      </ol>
      <button type="button" id="ib-modal-close">Entendido</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#ib-modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
}

function openUnsupportedModal() {
  const backdrop = document.createElement("div");
  backdrop.id = "ib-modal-backdrop";
  backdrop.innerHTML = `
    <div id="ib-modal">
      <h3>Instalación no disponible en este navegador</h3>
      <p style="font-size:13.5px;color:#34271F;line-height:1.5;margin:0 0 14px;">
        Este navegador no soporta instalar aplicaciones web directamente. Abrí este sitio con
        <strong>Chrome</strong> o <strong>Edge</strong> para instalar Bitácora como aplicación.
      </p>
      <button type="button" id="ib-modal-close">Entendido</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#ib-modal-close").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
}

function mountButton() {
  const anchor = document.getElementById("install-button-anchor");
  if (!anchor) return;

  injectStyles();

  const box = document.createElement("div");
  box.id = "ib-box";
  box.innerHTML = `
    <img src="./icons/icon-192.png" alt="" />
    <div class="ib-text"><strong>Instalá Bitácora</strong><span>Acceso rápido, funciona sin conexión.</span></div>
    <button id="ib-btn" type="button" ${supportsInstallPrompt() ? "disabled" : ""}>Instalar</button>
  `;
  anchor.appendChild(box);

  document.getElementById("ib-btn").addEventListener("click", async () => {
    if (isIOS()) { openIOSModal(); return; }
    if (!supportsInstallPrompt()) { openUnsupportedModal(); return; }
    if (!deferredPrompt) return; // aún no disparó beforeinstallprompt; el botón queda deshabilitado hasta entonces
    const btn = document.getElementById("ib-btn");
    btn.disabled = true;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome !== "accepted") btn.disabled = false;
  });
}

export function renderInstallButton() {
  const reveal = () => {
    if (isStandalone()) {
      // Ya corre instalada: mostrar login directo, sin banner de instalación.
      toggleLoginSection(true);
      return;
    }
    // No instalada: login queda oculto (ya está por defecto vía CSS inline),
    // solo se muestra el banner de instalación.
    toggleLoginSection(false);
    mountButton();
  };

  if (document.getElementById("install-button-anchor") || document.getElementById("login-section")) {
    reveal();
  } else {
    document.addEventListener("DOMContentLoaded", reveal);
  }
}

renderInstallButton();
