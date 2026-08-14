// ============================================================================
// Banner de instalación visible (página de login).
// Usa la MISMA tarjeta que install-gate.js (definida en install-ui.js), en
// modo "inline" (no bloqueante) — por eso ambos se ven idénticos en cualquier
// dispositivo. Además controla la visibilidad de #login-section: el
// formulario de login queda oculto hasta que la app corre instalada.
//
// Uso: <script type="module" src="./js/install-button.js"></script>
// en index.html (login).
// ============================================================================

import {
  isStandalone,
  isDevBypass,
  onInstalled,
  mountInstallCard,
} from "./install-ui.js";

function toggleLoginSection(show) {
  const el = document.getElementById("login-section");
  if (el) el.style.display = show ? "" : "none";
}

function markInstalled() {
  const box = document.getElementById("install-button-anchor")?.firstElementChild;
  if (!box) return;
  box.classList.add("pwa-ic-installed");
  box.innerHTML = `
    <img src="./icons/icon-192.png" alt="" />
    <h1>Bitácora instalada ✓</h1>
    <p>Ya tenés acceso rápido desde tu dispositivo.</p>
  `;
}

onInstalled(() => {
  markInstalled();
  toggleLoginSection(true);
});

function mountBanner() {
  const anchor = document.getElementById("install-button-anchor");
  if (!anchor) return;

  const card = document.createElement("div");
  anchor.appendChild(card);

  mountInstallCard(card, {
    iconSrc: "./icons/icon-192.png",
    blocking: false,
    allowContinue: true,
    inline: true,
    onContinue: () => toggleLoginSection(true), // navegador sin soporte técnico: dejar pasar al login igual
  });
}

export function renderInstallButton() {
  const reveal = () => {
    if (isStandalone() || isDevBypass()) {
      toggleLoginSection(true);
      return;
    }
    toggleLoginSection(false);
    mountBanner();
  };

  if (document.getElementById("install-button-anchor") || document.getElementById("login-section")) {
    reveal();
  } else {
    document.addEventListener("DOMContentLoaded", reveal);
  }
}

renderInstallButton();
