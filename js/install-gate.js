// ============================================================================
// Gate de instalación obligatoria.
// Bloquea el uso de la app (overlay a pantalla completa, sin botón de cerrar)
// hasta que se detecta que corre como PWA instalada.
// El diseño de la tarjeta vive en install-ui.js (compartido con el banner
// del login) — este archivo solo decide CUÁNDO bloquear y envuelve la
// tarjeta en un overlay de pantalla completa.
//
// Uso: <script type="module" src="./js/install-gate.js"></script>
// en las páginas protegidas (app.html, admin.html).
// ============================================================================

import {
  isStandalone,
  isDevBypass,
  onInstalled,
  mountInstallCard,
} from "./install-ui.js";

function hideGate() {
  const overlay = document.getElementById("ig-overlay");
  if (overlay) overlay.remove();
  document.documentElement.style.overflow = "";
}

onInstalled(hideGate);

function paint() {
  const overlay = document.createElement("div");
  overlay.id = "ig-overlay";
  overlay.className = "pwa-ic-overlay";

  const card = document.createElement("div");
  overlay.appendChild(card);
  document.documentElement.appendChild(overlay);

  mountInstallCard(card, {
    iconSrc: "./icons/icon-192.png",
    blocking: true,
    allowContinue: true,
    inline: false,
    onContinue: () => {
      try { sessionStorage.setItem("bitacora_install_bypass", "1"); } catch {}
      hideGate();
    },
  });
}

export function enforceInstallGate() {
  if (isStandalone() || isDevBypass()) return; // instalada, o modo desarrollo

  let bypass = false;
  try { bypass = sessionStorage.getItem("bitacora_install_bypass") === "1"; } catch {}
  if (bypass) return; // navegador de escritorio sin soporte técnico (ver install-ui.js)

  document.documentElement.style.overflow = "hidden";

  if (document.body) paint();
  else document.addEventListener("DOMContentLoaded", paint);
}

enforceInstallGate();
