import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG_KEY = "bitacora_cfg_v1";

/** Lee configuración guardada (Project URL + anon key). */
export function getCfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch { return null; }
}

/** Guarda configuración (Project URL + anon key). */
export function saveCfg(url, anon) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon }));
}

/** Escribe mensaje en un <p id="..."> o similar. */
export function setMsg(elId, text, isErr) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (isErr ? "err" : "ok");
}

/** Crea cliente Supabase si hay configuración. */
export async function ensureSupabase() {
  const cfg = getCfg();
  if (!cfg?.url || !cfg?.anon) return null;

  // detectSessionInUrl es clave para flujos recovery/invite cuando la URL trae tokens/hash.
  return createClient(cfg.url, cfg.anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

/** Devuelve { supabase, session }. */
export async function requireSession() {
  const supabase = await ensureSupabase();
  if (!supabase) return { supabase: null, session: null };
  const { data } = await supabase.auth.getSession();
  return { supabase, session: data?.session || null };
}

/**
 * Lee tu profile.
 * Importante: evitamos .single() directo porque si hay duplicados produce:
 * "Cannot coerce the result to a single JSON object"
 */
export async function getMyProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, division, squad_code, active")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) return { profile: null, error };
  return { profile: data || null, error: null };
}

/**
 * Invita usuario vía Edge Function REAL: bright-task
 * Mantiene la firma anterior (adminEmail, adminPassword, payload) para no romper admin.js,
 * pero esos valores ya no se usan en la function.
 *
 * Reglas:
 * - El body debe incluir 'email' en el nivel raíz.
 * - Si te pasaran { payload: {...} } lo aplanamos.
 */
export async function callInviteEdge(supabase, adminEmail, adminPassword, payload) {
  const body = payload?.payload ? payload.payload : payload;

  const { data, error } = await supabase.functions.invoke("bright-task", {
    body
  });

  return { data, error };
}
