import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CFG_KEY = "bitacora_cfg_v1";

// Cachea el cliente en memoria para evitar crear múltiples instancias por página.
let _supabaseClient = null;

export function getCfg() {
  // 1) Prefer saved localStorage config (useful for dev/override)
  try {
    const stored = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
    if (stored?.url && stored?.anon) return stored;
  } catch {}

  // 2) Fallback to repo-shipped config (recommended for end-users)
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return { url: SUPABASE_URL, anon: SUPABASE_ANON_KEY };
  }

  return null;
}

export function saveCfg(url, anon) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon }));
}

export function setMsg(elId, text, isErr) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (isErr ? "err" : "ok");
}

export async function ensureSupabase() {
  const cfg = getCfg();
  if (!cfg?.url || !cfg?.anon) return null;

  // Reusa si ya existe y coincide con la config actual.
  if (_supabaseClient && _supabaseClient.__cfg_url === cfg.url && _supabaseClient.__cfg_anon === cfg.anon) {
    return _supabaseClient;
  }

  const client = createClient(cfg.url, cfg.anon);
  // Marcas internas para validar reuso.
  client.__cfg_url = cfg.url;
  client.__cfg_anon = cfg.anon;
  _supabaseClient = client;
  return client;
}

export async function requireSession() {
  const supabase = await ensureSupabase();
  if (!supabase) return { supabase: null, session: null };

  // 1) Read cached session (fast)
  const { data: sessData } = await supabase.auth.getSession();
  const session = sessData?.session || null;
  if (!session) return { supabase, session: null };

  // Sin conexión: no hay forma de validar contra el servidor (getUser
  // requiere red). Antes esto se trataba igual que "no logueado" y
  // mandaba de vuelta al login — rompía la app entera sin internet, ya
  // que app.js usa esta función como puerta de entrada. Con sesión local
  // guardada, se deja pasar igual; app.html ya maneja con calma cualquier
  // llamada a Supabase que falle por falta de conexión una vez adentro.
  if (!navigator.onLine) {
    return { supabase, session };
  }

  // 2) Validate against the server (avoids redirect loops caused by stale local sessions)
  try {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData?.user) return { supabase, session: null };
  } catch {
    // Falló la llamada de red (p.ej. se cortó la conexión justo acá,
    // aunque navigator.onLine todavía no se haya actualizado): mejor
    // dejar pasar con la sesión local que trabar la app entera.
    return { supabase, session };
  }

  return { supabase, session };
}

export async function getMyProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", userId)
    .single();
  if (error) return { profile: null, error };
  return { profile: data, error: null };
}

export async function callInviteEdge(supabase, adminEmail, adminPassword, payload) {
  const { data, error } = await supabase.functions.invoke("bright-task", {
    body: {
      email: payload.email,
      full_name: payload.full_name,
      // assignment fields (expected by the Edge Function)
      role: payload.role,
      divisions: payload.divisions,
      squads: payload.squads,
      // division/squad_code singulares deprecados (Opción A, ago 2026):
      // bright-task ya no los persiste en profiles.
      // Brevo/SMTP no resultó confiable para reset/invite (ago 2026): la
      // app ya no envía correos en ningún flujo administrativo. bright-task
      // siempre genera el link vía generateLink (nunca inviteUserByEmail);
      // el admin lo copia y lo envía por fuera (WhatsApp, etc).
      redirectTo: payload.redirectTo,
    },
  });
  return { data, error };
}

export async function callManageUsersEdge(supabase, body) {
  const { data, error } = await supabase.functions.invoke("manage-users", { body });
  return { data, error };
}

// ---------------------------------------------------------------------------
// Orden estándar (nov 2026) para Estadística y Administrar Usuarios:
//   1) Escuadrón por color, Takers antes que Makers (EQUIPOS al final)
//   2) Sección: Takers → RJ → Makers
//   3) Nombre alfabético (sin distinguir mayúsculas ni tildes)
// Lo que no tiene escuadrón/sección va al final de ese nivel.
// ---------------------------------------------------------------------------
export const SQUAD_ORDER = ["URT", "URM", "UAZT", "UAZM", "UAT", "UAM", "UNT", "UNM", "UVT", "UVM", "EQUIPOS"];
const SECTION_ORDER = ["takers", "rj", "makers"];

export function squadRank(code) {
  const i = SQUAD_ORDER.indexOf(String(code || "").trim().toUpperCase());
  return i === -1 ? SQUAD_ORDER.length : i;
}

export function sectionRank(section) {
  const i = SECTION_ORDER.indexOf(String(section || "").trim().toLowerCase());
  return i === -1 ? SECTION_ORDER.length : i;
}

const nameCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

// a/b: { squad, section, name }
export function compareSquadSectionName(a, b) {
  return (squadRank(a.squad) - squadRank(b.squad))
    || (sectionRank(a.section) - sectionRank(b.section))
    || nameCollator.compare(a.name || "", b.name || "");
}

// ---------------------------------------------------------------------------
// Hora de actividades (Anuncios, nov 2026). En pantalla SIEMPRE AM/PM; la
// base de datos guarda tipo `time` (HH:MM:SS) solo para poder ordenar.
// ---------------------------------------------------------------------------
// "19:30:00" -> { h12: 7, min: 30, ampm: "PM" } | null
export function parseTime12(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return null;
  const h24 = Number(m[1]);
  const min = Number(m[2]);
  return { h12: (h24 % 12) || 12, min, ampm: h24 >= 12 ? "PM" : "AM" };
}

// "19:30:00" -> "7:30 PM" ; vacío -> ""
export function formatTime12(t) {
  const p = parseTime12(t);
  if (!p) return "";
  return `${p.h12}:${String(p.min).padStart(2, "0")} ${p.ampm}`;
}

// (7, 30, "PM") -> "19:30" (formato que acepta Postgres `time`) | null
export function time12ToDb(h12, min, ampm) {
  const h = Number(h12), mi = Number(min);
  if (!h || h < 1 || h > 12 || Number.isNaN(mi) || (ampm !== "AM" && ampm !== "PM")) return null;
  const h24 = (h % 12) + (ampm === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

// Orden de actividades: por fecha y, dentro del mismo día, por hora
// (sin hora va al final del día).
export function compareDateTime(a, b) {
  return (a.event_date || "").localeCompare(b.event_date || "")
    || (a.event_time || "99").localeCompare(b.event_time || "99");
}

// ¿Actividad vencida? (Opción A, nov 2026): con hora → vencida cuando ya
// pasó su fecha+hora (hora local); sin hora (filas viejas) → cuando su
// fecha es anterior a hoy. Única regla para tabla de la app, tabla de
// Admin, popup semanal y "Agregar a mis anuncios de célula".
export function isActivityExpired(r, now = new Date()) {
  if (!r || !r.event_date) return false;
  const [y, mo, d] = String(r.event_date).split("-").map(Number);
  if (!y || !mo || !d) return false;
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(r.event_time || ""));
  if (tm) return new Date(y, mo - 1, d, Number(tm[1]), Number(tm[2])) <= now;
  return new Date(y, mo - 1, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
