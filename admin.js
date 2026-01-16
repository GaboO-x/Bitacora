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

  // -----------------------------
  // Calendario / Actividades CRUD
  // -----------------------------
  const calEls = {
    activity: document.getElementById("calActivity"),
    eventDate: document.getElementById("calEventDate"),
    ownerName: document.getElementById("calOwnerName"),
    contactPhone: document.getElementById("calContactPhone"),
    investment: document.getElementById("calInvestment"),
    btnSave: document.getElementById("calBtnSave"),
    btnCancel: document.getElementById("calBtnCancel"),
    tbody: document.getElementById("calTbody"),
  };

  let calSelectedId = null;
  let calRows = [];
  let calBusy = false;

  function safeText(v) {
    return (v ?? "").toString();
  }

  function fmtMoney(v) {
    if (v === null || v === undefined || v === "") return "";
    const num = Number(v);
    if (Number.isNaN(num)) return safeText(v);
    return num.toLocaleString("es-CR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function setCalSaveLoading(isLoading, labelWhenIdle) {
    if (!calEls.btnSave) return;
    if (!calEls.btnSave.dataset.originalText) {
      calEls.btnSave.dataset.originalText = calEls.btnSave.textContent || "Guardar";
    }
    const idleText = labelWhenIdle || calEls.btnSave.dataset.originalText;

    if (!isLoading) {
      calEls.btnSave.disabled = false;
      calEls.btnSave.textContent = idleText;
      return;
    }

    calEls.btnSave.disabled = true;
    calEls.btnSave.textContent = "Procesando…";
  }

  function setCalCancelVisible(isVisible) {
    if (!calEls.btnCancel) return;
    calEls.btnCancel.style.display = isVisible ? "" : "none";
  }

  function resetCalForm() {
    calSelectedId = null;
    if (calEls.activity) calEls.activity.value = "";
    if (calEls.eventDate) calEls.eventDate.value = "";
    if (calEls.ownerName) calEls.ownerName.value = "";
    if (calEls.contactPhone) calEls.contactPhone.value = "";
    if (calEls.investment) calEls.investment.value = "";
    if (calEls.btnSave) calEls.btnSave.textContent = "Crear actividad";
    setCalCancelVisible(false);
  }

  function readCalForm() {
    const activity = (calEls.activity?.value || "").trim();
    const event_date = (calEls.eventDate?.value || "").trim();
    const owner_name = (calEls.ownerName?.value || "").trim();
    const contact_phone = (calEls.contactPhone?.value || "").trim();
    const invRaw = (calEls.investment?.value || "").toString().trim();
    const investment = invRaw === "" ? null : Number(invRaw);

    return { activity, event_date, owner_name, contact_phone, investment };
  }

  function validateCalPayload(p) {
    if (!p.activity) return "Falta Actividad.";
    if (!p.event_date) return "Falta Fecha.";
    return null;
  }

  function renderCalTable() {
    if (!calEls.tbody) return;

    if (!Array.isArray(calRows) || calRows.length === 0) {
      calEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">No hay actividades.</td></tr>';
      return;
    }

    calEls.tbody.innerHTML = calRows.map(r => {
      const id = safeText(r.id);
      const activity = safeText(r.activity);
      const date = safeText(r.event_date);
      const owner = safeText(r.owner_name);
      const phone = safeText(r.contact_phone);
      const inv = fmtMoney(r.investment);

      return `
        <tr data-row-id="${id}">
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${activity}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${date}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${owner}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${phone}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${inv}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);white-space:nowrap;">
            <button data-action="edit" data-id="${id}" class="secondary" style="margin-right:8px;">Editar</button>
            <button data-action="delete" data-id="${id}" class="secondary">Eliminar</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadCalActivities() {
    if (!calEls.tbody) return;
    calEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Cargando…</td></tr>';

    const { data, error } = await supabase
      .from("calendar_activities")
      .select("*")
      .order("event_date", { ascending: true });

    if (error) {
      setMsg("calMsg", error.message, true);
      calRows = [];
      return renderCalTable();
    }

    calRows = Array.isArray(data) ? data : [];
    renderCalTable();
  }

  function startEditCal(id) {
    const row = calRows.find(x => safeText(x.id) === safeText(id));
    if (!row) return;

    calSelectedId = row.id;
    if (calEls.activity) calEls.activity.value = safeText(row.activity);
    if (calEls.eventDate) calEls.eventDate.value = safeText(row.event_date);
    if (calEls.ownerName) calEls.ownerName.value = safeText(row.owner_name);
    if (calEls.contactPhone) calEls.contactPhone.value = safeText(row.contact_phone);
    if (calEls.investment) calEls.investment.value = row.investment ?? "";

    if (calEls.btnSave) calEls.btnSave.textContent = "Guardar cambios";
    setCalCancelVisible(true);
  }

  async function saveCal() {
    if (calBusy) return;
    if (!calEls.btnSave) return;

    const wasEditing = !!calSelectedId;

    const payload = readCalForm();
    const validationError = validateCalPayload(payload);
    if (validationError) return setMsg("calMsg", validationError, true);

    // Importante: NO enviar created_by. Lo asigna el trigger.
    const dbPayload = {
      activity: payload.activity,
      event_date: payload.event_date,
      owner_name: payload.owner_name || null,
      contact_phone: payload.contact_phone || null,
      investment: payload.investment,
    };

    calBusy = true;
    setCalSaveLoading(true);
    setMsg("calMsg", "Procesando…", false);

    try {
      if (!calSelectedId) {
        const { error } = await supabase
          .from("calendar_activities")
          .insert(dbPayload);

        if (error) return setMsg("calMsg", error.message, true);
        setMsg("calMsg", "Actividad creada.", false);
        resetCalForm();
        await loadCalActivities();
        return;
      }

      const { error } = await supabase
        .from("calendar_activities")
        .update(dbPayload)
        .eq("id", calSelectedId);

      if (error) return setMsg("calMsg", error.message, true);
      setMsg("calMsg", "Actividad actualizada.", false);
      resetCalForm();
      await loadCalActivities();
    } finally {
      calBusy = false;
      setCalSaveLoading(false, wasEditing ? "Guardar cambios" : "Crear actividad");
    }
  }

  async function deleteCal(id, btn) {
    if (!id) return;
    const row = calRows.find(x => safeText(x.id) === safeText(id));
    const label = row?.activity ? `\n\nActividad: ${row.activity}` : "";
    const ok = window.confirm(`¿Eliminar esta actividad?${label}`);
    if (!ok) return;

    const originalText = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Procesando…";
    }

    setMsg("calMsg", "Procesando…", false);

    const { error } = await supabase
      .from("calendar_activities")
      .delete()
      .eq("id", id);

    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText || "Eliminar";
    }

    if (error) return setMsg("calMsg", error.message, true);
    setMsg("calMsg", "Actividad eliminada.", false);

    // Si estabas editando esta fila, resetea el form
    if (safeText(calSelectedId) === safeText(id)) resetCalForm();
    await loadCalActivities();
  }

  calEls.btnSave?.addEventListener("click", saveCal);
  calEls.btnCancel?.addEventListener("click", () => {
    resetCalForm();
    setMsg("calMsg", "Edición cancelada.", false);
  });

  calEls.tbody?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button");
    const action = btn?.dataset?.action;
    const id = btn?.dataset?.id;
    if (!action || !id) return;

    if (action === "edit") {
      startEditCal(id);
      return;
    }

    if (action === "delete") {
      deleteCal(id, btn);
    }
  });

  // Inicial
  resetCalForm();
  await loadCalActivities();
})();
