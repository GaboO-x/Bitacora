import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG_KEY = "bitacora_cfg_v1";

export function getCfg() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || "null");
  } catch {
    return null;
  }
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
  return createClient(cfg.url, cfg.anon);
}

export async function requireSession() {
  const supabase = await ensureSupabase();
  if (!supabase) return { supabase: null, session: null };
  const { data } = await supabase.auth.getSession();
  return { supabase, session: data.session };
}

export async function getMyProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, division, squad_code, active")
    .eq("id", userId)
    .single();

  if (error) return { profile: null, error };
  return { profile: data, error: null };
}

// Envía invitación usando la Edge Function real del proyecto.
// Compatible con llamadas antiguas: (supabase, adminEmail, adminPassword, payload)
// y llamadas simples: (supabase, payload)
export async function callInviteEdge(supabase, a, b, c) {
  if (!supabase) return { data: null, error: new Error("Supabase client no inicializado") };

  // Backward compatible parameter handling
  let payload = c ?? a;

  // Si lo llamaron como callInviteEdge(supabase, "email@dominio.com")
  if (typeof payload === "string") payload = { email: payload };

  // Si lo llamaron como callInviteEdge(supabase, adminEmail, adminPassword, {payload:{...}})
  if (payload?.payload && !payload.email) payload = payload.payload;

  // Asegurar que el body tenga email en el nivel raíz (requerido por bright-task)
  const body = { ...(payload || {}) };

  const { data, error } = await supabase.functions.invoke("bright-task", { body });
  return { data, error };
}
