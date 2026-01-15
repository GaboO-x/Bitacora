import { requireSession, setMsg, getMyProfile, callInviteEdge } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) return window.location.href = "./index.html";

  document.getElementById("btnLogout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  });

  const user = session.user;
  const { profile } = await getMyProfile(supabase, user.id);
  if (!profile || profile.role !== "admin") return window.location.href = "./app.html";

  const btnInvite = document.getElementById("btnInvite");
  let loadingTimer = null;

  function setInviteLoading(isLoading) {
    if (!btnInvite) return;
    if (!btnInvite.dataset.originalText) {
      btnInvite.dataset.originalText = btnInvite.textContent || "Enviar invitación";
    }

    if (!isLoading) {
      btnInvite.disabled = false;
      btnInvite.textContent = btnInvite.dataset.originalText;
      if (loadingTimer) {
        clearInterval(loadingTimer);
        loadingTimer = null;
      }
      return;
    }

    btnInvite.disabled = true;
    const base = "Enviando";
    let dots = 0;
    btnInvite.textContent = base;
    loadingTimer = setInterval(() => {
      dots = (dots + 1) % 4;
      btnInvite.textContent = base + ".".repeat(dots);
    }, 350);
  }

  btnInvite?.addEventListener("click", async () => {
    if (btnInvite.disabled) return;

    const email = (document.getElementById("inviteEmail").value || "").trim().toLowerCase();
    const full_name = (document.getElementById("inviteName").value || "").trim();

    const role = (document.querySelector('input[name="inviteRole"]:checked')?.value || "user").trim();

    const divisions = Array.from(document.querySelectorAll('input[name="inviteDivision"]:checked'))
      .map(x => (x.value || "").trim())
      .filter(Boolean);

    const squads = Array.from(document.querySelectorAll('input[name="inviteSquad"]:checked'))
      .map(x => (x.value || "").trim())
      .filter(Boolean);

    if (!email) return setMsg("msg", "Falta email.", true);
    if (!full_name) return setMsg("msg", "Falta nombre completo.", true);

    // Backward-compatible fields (si el backend aún espera singular)
    const division = divisions[0] || null;
    const squad_code = squads[0] || null;

    const payload = { email, full_name, role, divisions, squads, division, squad_code };

    setMsg("msg", "Enviando invitación…", false);
    setInviteLoading(true);

    try {
      const { data, error } = await callInviteEdge(supabase, user.email, null, payload);
      if (error) return setMsg("msg", error.message, true);

      try {
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        if (parsed?.ok) setMsg("msg", `Invitación enviada: ${parsed.email}`, false);
        else setMsg("msg", JSON.stringify(parsed), true);
      } catch {
        setMsg("msg", String(data), false);
      }
    } finally {
      setInviteLoading(false);
    }
  });
})();
