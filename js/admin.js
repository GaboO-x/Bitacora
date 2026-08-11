import { requireSession, setMsg, getMyProfile, callInviteEdge, callManageUsersEdge } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) {
    window.location.href = "./index.html";
    return;
  }

  // Logout
  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  });

  // AuthZ: solo admin
  const user = session.user;
  const { profile } = await getMyProfile(supabase, user.id);
  if (!profile || profile.role !== "admin") {
    window.location.href = "./app.html";
    return;
  }

  // -----------------------------
  // Navegación (Inicio / Secciones)
  // -----------------------------
  const sections = {
    home: document.getElementById("sectionHome"),
    invite: document.getElementById("sectionInvite"),
    calendar: document.getElementById("sectionCalendar"),
    announcements: document.getElementById("sectionAnnouncements"),
    materials: document.getElementById("sectionMaterials"),
    users: document.getElementById("sectionUsers"),
  };

  function showSection(key) {
    Object.values(sections).forEach(el => el?.classList.remove("active"));
    sections[key]?.classList.add("active");
    setActiveSideNav(key);
  }

  const goInvite = () => showSection("invite");
  const goCalendar = async () => { showSection("calendar"); await loadCalActivities(); };
  const goAnnouncements = async () => { showSection("announcements"); await loadAnnouncements(); };
  const goMaterials = async () => { showSection("materials"); await loadMaterials(); };
  const goUsers = async () => { showSection("users"); await loadAllUsers(); };
  const goHome = () => showSection("home");

  // Menu buttons (tarjetas de Inicio)
  document.getElementById("navInvite")?.addEventListener("click", goInvite);
  document.getElementById("navCalendar")?.addEventListener("click", goCalendar);
  document.getElementById("navAnnouncements")?.addEventListener("click", goAnnouncements);
  document.getElementById("navMaterials")?.addEventListener("click", goMaterials);
  document.getElementById("navUsers")?.addEventListener("click", goUsers);

  // Mismos destinos, desde el sidebar
  document.getElementById("sideNavInvite")?.addEventListener("click", goInvite);
  document.getElementById("sideNavCalendar")?.addEventListener("click", goCalendar);
  document.getElementById("sideNavAnnouncements")?.addEventListener("click", goAnnouncements);
  document.getElementById("sideNavMaterials")?.addEventListener("click", goMaterials);
  document.getElementById("sideNavUsers")?.addEventListener("click", goUsers);
  document.getElementById("btnGoHome")?.addEventListener("click", goHome);

  function setActiveSideNav(key) {
    const idByKey = {
      invite: "sideNavInvite",
      calendar: "sideNavCalendar",
      announcements: "sideNavAnnouncements",
      materials: "sideNavMaterials",
      users: "sideNavUsers",
    };
    document.querySelectorAll(".sidebar .nav-btn[data-nav]").forEach(btn => {
      btn.classList.toggle("is-active", btn.id === idByKey[key]);
    });
  }

  // Back to home buttons
  document.getElementById("backFromInvite")?.addEventListener("click", goHome);
  document.getElementById("backFromCalendar")?.addEventListener("click", goHome);
  document.getElementById("backFromAnnouncements")?.addEventListener("click", goHome);
  document.getElementById("backFromMaterials")?.addEventListener("click", goHome);
  document.getElementById("backFromUsers")?.addEventListener("click", goHome);

  // -----------------------------
  // Sidebar toggle (móvil / escritorio) — mismo patrón que app.html
  // -----------------------------
  const appShell = document.getElementById("appShell");
  const btnToggleSidebar = document.getElementById("btnToggleSidebar");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const isMobileSidebar = () => window.matchMedia("(max-width: 920px)").matches;

  const toggleSidebar = () => {
    if (!appShell) return;
    if (isMobileSidebar()) {
      appShell.classList.toggle("is-sidebar-open");
    } else {
      appShell.classList.toggle("is-sidebar-collapsed");
    }
  };
  btnToggleSidebar?.addEventListener("click", toggleSidebar);

  window.addEventListener("resize", () => {
    if (!isMobileSidebar()) appShell?.classList.remove("is-sidebar-open");
  });

  sidebarBackdrop?.addEventListener("click", () => {
    appShell?.classList.remove("is-sidebar-open");
  });

  const closeSidebarOnMobile = () => {
    if (isMobileSidebar()) appShell?.classList.remove("is-sidebar-open");
  };
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.addEventListener("click", closeSidebarOnMobile);
  });

  // -----------------------------
  // Invitar usuario
  // -----------------------------
  const btnInvite = document.getElementById("btnInvite");
  let inviteLoadingTimer = null;

  function setInviteLoading(isLoading) {
    if (!btnInvite) return;
    if (!btnInvite.dataset.originalText) {
      btnInvite.dataset.originalText = btnInvite.textContent || "Enviar invitación";
    }

    if (!isLoading) {
      btnInvite.disabled = false;
      btnInvite.textContent = btnInvite.dataset.originalText;
      if (inviteLoadingTimer) {
        clearInterval(inviteLoadingTimer);
        inviteLoadingTimer = null;
      }
      return;
    }

    btnInvite.disabled = true;
    const base = "Enviando";
    let dots = 0;
    btnInvite.textContent = base;
    inviteLoadingTimer = setInterval(() => {
      dots = (dots + 1) % 4;
      btnInvite.textContent = base + ".".repeat(dots);
    }, 350);
  }

  btnInvite?.addEventListener("click", async () => {
    if (btnInvite.disabled) return;

    const email = (document.getElementById("inviteEmail")?.value || "").trim().toLowerCase();
    const full_name = (document.getElementById("inviteName")?.value || "").trim();

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

  function setCalMsg(text, isError) {
    setMsg("calMsg", text, !!isError);
  }

  function setCalSaveLabel(text) {
    if (!calEls.btnSave) return;
    calEls.btnSave.title = text;
    calEls.btnSave.setAttribute("aria-label", text);
  }

  function setCalSaveLoading(isLoading, idleText) {
    if (!calEls.btnSave) return;
    if (!calEls.btnSave.dataset.originalText) {
      calEls.btnSave.dataset.originalText = calEls.btnSave.title || "Crear actividad";
    }

    if (!isLoading) {
      calEls.btnSave.disabled = false;
      setCalSaveLabel(idleText || calEls.btnSave.dataset.originalText);
      return;
    }

    calEls.btnSave.disabled = true;
    setCalSaveLabel("Procesando…");
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
    setCalSaveLabel("Crear actividad");
    if (calEls.btnSave) calEls.btnSave.dataset.originalText = "Crear actividad";
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
    if (p.investment !== null && Number.isNaN(p.investment)) return "Inversión inválida.";
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
            <button data-action="edit" data-id="${id}" class="mat-icon-btn" style="margin-right:6px;" title="Editar" aria-label="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button data-action="delete" data-id="${id}" class="mat-icon-btn" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadCalActivities() {
    if (calBusy) return;
    calBusy = true;
    try {
      if (calEls.tbody) {
        calEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Cargando…</td></tr>';
      }

      const { data, error } = await supabase
        .from("calendar_activities")
        .select("*")
        .order("event_date", { ascending: true });

      if (error) {
        setCalMsg(error.message, true);
        calRows = [];
        renderCalTable();
        return;
      }

      calRows = Array.isArray(data) ? data : [];
      renderCalTable();
      setCalMsg("", false);
    } finally {
      calBusy = false;
    }
  }

  function fillFormForEdit(row) {
    calSelectedId = row.id;
    if (calEls.activity) calEls.activity.value = row.activity ?? "";
    if (calEls.eventDate) calEls.eventDate.value = row.event_date ?? "";
    if (calEls.ownerName) calEls.ownerName.value = row.owner_name ?? "";
    if (calEls.contactPhone) calEls.contactPhone.value = row.contact_phone ?? "";
    if (calEls.investment) calEls.investment.value = row.investment ?? "";

    setCalSaveLabel("Guardar cambios");
    setCalCancelVisible(true);

    setCalMsg("Editando actividad…", false);
  }

  calEls.btnCancel?.addEventListener("click", () => {
    resetCalForm();
    setCalMsg("", false);
  });

  calEls.btnSave?.addEventListener("click", async () => {
    if (calBusy) return;

    const payload = readCalForm();
    const err = validateCalPayload(payload);
    if (err) {
      setCalMsg(err, true);
      return;
    }

    calBusy = true;
    setCalSaveLoading(true);

    try {
      if (!calSelectedId) {
        // INSERT (SIN created_by; lo asigna el trigger)
        const { error } = await supabase
          .from("calendar_activities")
          .insert({
            activity: payload.activity,
            event_date: payload.event_date,
            owner_name: payload.owner_name,
            contact_phone: payload.contact_phone,
            investment: payload.investment,
          });

        if (error) {
          setCalMsg(error.message, true);
          return;
        }

        setCalMsg("Actividad creada.", false);
        resetCalForm();
        await loadCalActivities();
        return;
      }

      // UPDATE
      const { error } = await supabase
        .from("calendar_activities")
        .update({
          activity: payload.activity,
          event_date: payload.event_date,
          owner_name: payload.owner_name,
          contact_phone: payload.contact_phone,
          investment: payload.investment,
        })
        .eq("id", calSelectedId);

      if (error) {
        setCalMsg(error.message, true);
        return;
      }

      setCalMsg("Cambios guardados.", false);
      resetCalForm();
      await loadCalActivities();
    } finally {
      setCalSaveLoading(false, calSelectedId ? "Guardar cambios" : "Crear actividad");
      calBusy = false;
    }
  });

  // Delegación de acciones (Editar/Eliminar)
  calEls.tbody?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!action || !id) return;

    const row = calRows.find(x => String(x.id) === String(id));
    if (!row) return;

    if (action === "edit") {
      fillFormForEdit(row);
      return;
    }

    if (action === "delete") {
      if (calBusy) return;
      const ok = window.confirm("¿Eliminar esta actividad? Esta acción no se puede deshacer.");
      if (!ok) return;

      calBusy = true;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Procesando…";

      try {
        const { error } = await supabase
          .from("calendar_activities")
          .delete()
          .eq("id", id);

        if (error) {
          setCalMsg(error.message, true);
          return;
        }

        setCalMsg("Actividad eliminada.", false);
        if (String(calSelectedId) === String(id)) resetCalForm();
        await loadCalActivities();
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
        calBusy = false;
      }
    }
  });

  // Carga inicial del menu
  showSection("home");


  // -----------------------------
  // Anuncios (subir imagen a Storage + registrar en tabla)
  // -----------------------------
  const annEls = {
    title: document.getElementById("annTitle"),
    file: document.getElementById("annFile"),
    btnPublish: document.getElementById("annBtnPublish"),
    list: document.getElementById("annList"),
  };

  let annBusy = false;
  let annRows = [];

  function setAnnMsg(text, isError) {
    setMsg("annMsg", text, !!isError);
  }

  function escapeHtml(s) {
    const str = (s == null) ? "" : String(s);
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parseFileNameFromUrl(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || "archivo";
    } catch {
      const parts = String(url || "").split("/");
      return parts[parts.length - 1] || "archivo";
    }
  }

  function renderAnnList() {
    if (!annEls.list) return;

    if (!Array.isArray(annRows) || annRows.length === 0) {
      annEls.list.innerHTML = '<div class="muted">No hay anuncios.</div>';
      return;
    }

    annEls.list.innerHTML = annRows.map(r => {
      const title = escapeHtml(r.title || "(Sin título)");
      const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      const url = r.image_url || "";
      const safeUrl = escapeHtml(url);
      const id = r.id;

      const viewBtn = url
        ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="mat-icon-btn" title="Ver" aria-label="Ver"><i class="fa-solid fa-eye"></i></a>`
        : "";

      const downloadBtn = url
        ? `<a href="${safeUrl}" download class="mat-icon-btn" title="Descargar" aria-label="Descargar"><i class="fa-solid fa-cloud-arrow-down"></i></a>`
        : "";

      return `
        <div class="mat-row mat-row-3col">
          <div class="mat-row__title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>
          <div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(created)}</div>
          <div class="mat-row__actions">
            ${viewBtn}
            ${downloadBtn}
            <button data-ann-action="delete" data-id="${escapeHtml(id)}" class="mat-icon-btn" type="button" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");
  }

  async function loadAnnouncements() {
    if (annBusy) return;
    annBusy = true;
    try {
      if (annEls.list) annEls.list.innerHTML = '<div class="muted">Cargando…</div>';

      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, image_url, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setAnnMsg(error.message, true);
        annRows = [];
        renderAnnList();
        return;
      }

      annRows = Array.isArray(data) ? data : [];
      renderAnnList();
      setAnnMsg("", false);
    } finally {
      annBusy = false;
    }
  }

  function setAnnPublishLoading(isLoading) {
    if (!annEls.btnPublish) return;
    if (!annEls.btnPublish.dataset.originalText) {
      annEls.btnPublish.dataset.originalText = annEls.btnPublish.textContent || "Publicar anuncio";
    }

    if (!isLoading) {
      annEls.btnPublish.disabled = false;
      annEls.btnPublish.textContent = annEls.btnPublish.dataset.originalText;
      return;
    }

    annEls.btnPublish.disabled = true;
    annEls.btnPublish.textContent = "Procesando…";
  }

  async function getPublicOrSignedUrl(bucket, path) {
    try {
      const pub = supabase.storage.from(bucket).getPublicUrl(path);
      if (pub?.data?.publicUrl) return pub.data.publicUrl;
    } catch {}

    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {}

    return null;
  }

  annEls.btnPublish?.addEventListener("click", async () => {
    if (annBusy) return;

    const title = (annEls.title?.value || "").trim();
    const file = annEls.file?.files?.[0] || null;

    if (!file) {
      setAnnMsg("Selecciona una imagen.", true);
      return;
    }

    annBusy = true;
    setAnnPublishLoading(true);
    setAnnMsg("Subiendo anuncio…", false);

    try {
      // Upload a Storage: bucket announcements
      const ext = (file.name || "").split(".").pop() || "png";
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "png";
      const filePath = `ann_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`;

      const { error: upErr } = await supabase
        .storage
        .from("announcements")
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });

      if (upErr) {
        setAnnMsg(upErr.message, true);
        return;
      }

      const url = await getPublicOrSignedUrl("announcements", filePath);
      if (!url) {
        setAnnMsg("No se pudo obtener URL del archivo en Storage.", true);
        return;
      }

      // Insert a tabla announcements
      const { error: insErr } = await supabase
        .from("announcements")
        .insert({
          title: title || null,
          image_url: url,
        });

      if (insErr) {
        setAnnMsg(insErr.message, true);
        return;
      }

      if (annEls.title) annEls.title.value = "";
      if (annEls.file) annEls.file.value = "";

      setAnnMsg("Anuncio publicado.", false);
      await loadAnnouncements();
    } finally {
      setAnnPublishLoading(false);
      annBusy = false;
    }
  });

  annEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;
    const action = btn.getAttribute("data-ann-action");
    const id = btn.getAttribute("data-id");
    if (action !== "delete" || !id) return;

    if (annBusy) return;
    const ok = window.confirm("¿Eliminar este anuncio? Esta acción no se puede deshacer.");
    if (!ok) return;

    annBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Procesando…";

    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);

      if (error) {
        setAnnMsg(error.message, true);
        return;
      }

      setAnnMsg("Anuncio eliminado.", false);
      await loadAnnouncements();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText || "Eliminar";
      annBusy = false;
    }
  });

  // -----------------------------
  // Material de apoyo (subir imagen a Storage + registrar en tabla)
  // -----------------------------
  // Carpetas: tabla `material_folders` en Supabase (paso 3).
  // `materials.folder_id` referencia esa tabla (null = raíz).

  const MAT_TYPE_ICON = {
    folder:       "fa-solid fa-folder",
    word:         "fa-solid fa-file-word",
    image:        "fa-solid fa-image",
    pdf:          "fa-solid fa-file-pdf",
    ppt:          "fa-solid fa-file-powerpoint",
    link:         "fa-solid fa-link",
    link_spotify: "fa-brands fa-spotify",
    link_youtube: "fa-brands fa-youtube",
  };

  let matFoldersCache = [];

  function getMatFolderById(id) {
    return matFoldersCache.find(f => f.id === id) || null;
  }
  function getMatFolderChildren(parentId) {
    return matFoldersCache.filter(f => (f.parent_id || null) === (parentId || null));
  }
  function getMatFolderPath(id) {
    const path = [];
    let cur = id ? getMatFolderById(id) : null;
    while (cur) {
      path.unshift(cur);
      cur = cur.parent_id ? getMatFolderById(cur.parent_id) : null;
    }
    return path;
  }
  // Si la carpeta actual ya no existe (p. ej. se eliminó en otra sesión), vuelve a la raíz.
  function ensureValidMatFolder() {
    if (matState.currentFolderId && !getMatFolderById(matState.currentFolderId)) {
      matState.currentFolderId = null;
    }
  }
  function inferMatType(row) {
    const url = row.image_url || "";
    if (/spotify\.com/i.test(url)) return "link_spotify";
    if (/youtube\.com|youtu\.be/i.test(url)) return "link_youtube";
    const name = (row.file_name || url || "").toLowerCase();
    if (/\.pdf(\?|$)/.test(name)) return "pdf";
    if (/\.(docx?|rtf)(\?|$)/.test(name)) return "word";
    if (/\.(pptx?|key)(\?|$)/.test(name)) return "ppt";
    if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(name)) return "image";
    if (/^https?:\/\//i.test(url) && !row.file_name) return "link";
    return "image";
  }

  // Construye <option> jerárquicos indentados para los selects de carpeta.
  // selectedId (opcional) marca la opción actual como seleccionada.
  function buildFolderOptionsHtml(selectedId) {
    const sel = selectedId || "";
    const renderLevel = (parentId, depth) => matFoldersCache
      .filter(f => (f.parent_id || null) === (parentId || null))
      .map(f => {
        const indent = "\u2003".repeat(depth);
        const isSel = f.id === sel ? " selected" : "";
        return `<option value="${escapeHtml(f.id)}"${isSel}>${indent}${escapeHtml(f.name)}</option>` + renderLevel(f.id, depth + 1);
      }).join("");
    const rootSel = !sel ? " selected" : "";
    return `<option value=""${rootSel}>— Raíz —</option>` + renderLevel(null, 0);
  }

  const matEls = {
    title: document.getElementById("matTitle"),
    file: document.getElementById("matFile"),
    btnPublish: document.getElementById("matBtnPublish"),
    list: document.getElementById("matList"),
    targetFolder: document.getElementById("matTargetFolder"),
    kindFile: document.getElementById("matKindFile"),
    kindLink: document.getElementById("matKindLink"),
    fileWrap: document.getElementById("matFileWrap"),
    linkWrap: document.getElementById("matLinkWrap"),
    linkUrl: document.getElementById("matLinkUrl"),
    folderName: document.getElementById("matFolderName"),
    folderParent: document.getElementById("matFolderParent"),
    btnFolderCreate: document.getElementById("matBtnFolderCreate"),
    folderList: document.getElementById("matFolderList"),
    breadcrumb: document.getElementById("matBreadcrumb"),
  };

  // Modal de confirmación (reemplaza window.confirm en Material de apoyo:
  // eliminar material / eliminar carpeta). Mismo lenguaje visual que app.html.
  const matConfirmModal = document.getElementById("matConfirmModal");
  const matConfirmModalTitle = document.getElementById("matConfirmModalTitle");
  const matConfirmModalBody = document.getElementById("matConfirmModalBody");
  const matConfirmModalOk = document.getElementById("matConfirmModalOk");
  const matConfirmModalCancel = document.getElementById("matConfirmModalCancel");

  function showMatConfirm({ title = "Confirmar", body = "", confirmLabel = "Eliminar" } = {}) {
    return new Promise((resolve) => {
      if (!matConfirmModal) { resolve(window.confirm(body)); return; }

      if (matConfirmModalTitle) matConfirmModalTitle.textContent = title;
      if (matConfirmModalBody) matConfirmModalBody.textContent = body;
      if (matConfirmModalOk) matConfirmModalOk.textContent = confirmLabel;
      matConfirmModal.classList.remove("is-hidden");

      const cleanup = (result) => {
        matConfirmModal.classList.add("is-hidden");
        matConfirmModalOk?.removeEventListener("click", onOk);
        matConfirmModalCancel?.removeEventListener("click", onCancel);
        matConfirmModal.removeEventListener("click", onOverlay);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onOverlay = (e) => { if (e.target === matConfirmModal) cleanup(false); };

      matConfirmModalOk?.addEventListener("click", onOk);
      matConfirmModalCancel?.addEventListener("click", onCancel);
      matConfirmModal.addEventListener("click", onOverlay);
    });
  }

  const matState = { currentFolderId: null };

  let matBusy = false;
  let matRows = [];

  function setMatMsg(text, isError) {
    setMsg("matMsg", text, !!isError);
  }

  function refreshFolderSelects() {
    const html = buildFolderOptionsHtml();
    if (matEls.folderParent) matEls.folderParent.innerHTML = html;
    if (matEls.targetFolder) matEls.targetFolder.innerHTML = html;
  }

  function updateMatKindUI() {
    const isLink = !!matEls.kindLink?.checked;
    if (matEls.fileWrap) matEls.fileWrap.style.display = isLink ? "none" : "";
    if (matEls.linkWrap) matEls.linkWrap.style.display = isLink ? "" : "none";
  }
  matEls.kindFile?.addEventListener("change", updateMatKindUI);
  matEls.kindLink?.addEventListener("change", updateMatKindUI);
  updateMatKindUI();

  function renderMatFolderList() {
    if (!matEls.folderList) return;
    if (!matFoldersCache.length) {
      matEls.folderList.innerHTML = '<div class="muted small">No hay carpetas creadas.</div>';
      return;
    }
    const renderLevel = (parentId, depth) => matFoldersCache
      .filter(f => (f.parent_id || null) === (parentId || null))
      .map(f => {
        const pad = 10 + depth * 18;
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);padding-left:${pad}px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <i class="fa-solid fa-folder" style="color:var(--accent2);"></i>
            <span style="font-weight:600;">${escapeHtml(f.name)}</span>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button type="button" class="mat-icon-btn" data-mat-folder-action="rename" data-id="${escapeHtml(f.id)}" title="Editar" aria-label="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button type="button" class="mat-icon-btn" data-mat-folder-action="delete" data-id="${escapeHtml(f.id)}" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>` + renderLevel(f.id, depth + 1);
      }).join("");
    matEls.folderList.innerHTML = renderLevel(null, 0);
  }

  matEls.btnFolderCreate?.addEventListener("click", async () => {
    const name = (matEls.folderName?.value || "").trim();
    if (!name) { setMatMsg("Escribe un nombre de carpeta.", true); return; }
    const parentId = matEls.folderParent?.value || null;

    const { error } = await supabase
      .from("material_folders")
      .insert({ name, parent_id: parentId || null, created_by: user.id });

    if (error) { setMatMsg(error.message, true); return; }

    if (matEls.folderName) matEls.folderName.value = "";
    setMatMsg("Carpeta creada.", false);
    await loadMaterials();
  });

  matEls.folderList?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button[data-mat-folder-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-mat-folder-action");
    const id = btn.getAttribute("data-id");
    const folder = getMatFolderById(id);
    if (!folder) return;

    if (action === "rename") {
      const next = window.prompt("Nuevo nombre de la carpeta:", folder.name);
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed) return;

      const { error } = await supabase
        .from("material_folders")
        .update({ name: trimmed })
        .eq("id", id);

      if (error) { setMatMsg(error.message, true); return; }
      setMatMsg("Carpeta renombrada.", false);
      await loadMaterials();
      return;
    }

    if (action === "delete") {
      const ok = await showMatConfirm({
        title: "Eliminar carpeta",
        body: `¿Eliminar la carpeta "${folder.name}"? Las subcarpetas también se eliminarán. Los materiales dentro no se borran: quedarán en la carpeta raíz.`,
        confirmLabel: "Eliminar",
      });
      if (!ok) return;

      const { error } = await supabase
        .from("material_folders")
        .delete()
        .eq("id", id);

      if (error) { setMatMsg(error.message, true); return; }

      setMatMsg("Carpeta eliminada.", false);
      await loadMaterials();
    }
  });

  function renderMatBreadcrumb() {
    if (!matEls.breadcrumb) return;
    const path = getMatFolderPath(matState.currentFolderId);
    let html = `<button type="button" class="secondary users-action-btn" data-mat-crumb="">Material</button>`;
    path.forEach(f => {
      html += ` <span class="muted">/</span> <button type="button" class="secondary users-action-btn" data-mat-crumb="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`;
    });
    matEls.breadcrumb.innerHTML = html;
  }
  matEls.breadcrumb?.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("[data-mat-crumb]");
    if (!btn) return;
    matState.currentFolderId = btn.getAttribute("data-mat-crumb") || null;
    renderMatBreadcrumb();
    renderMatList();
  });

  function renderMatList() {
    if (!matEls.list) return;

    const folders = getMatFolderChildren(matState.currentFolderId);
    const rows = Array.isArray(matRows) ? matRows : [];
    const itemsHere = rows.filter(r => (r.folder_id || null) === (matState.currentFolderId || null));

    if (!folders.length && !itemsHere.length) {
      matEls.list.innerHTML = '<div class="muted">No hay materiales en esta carpeta.</div>';
      return;
    }

    const folderCards = folders.map(f => `
      <div data-mat-open-folder="${escapeHtml(f.id)}" style="border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;">
        <i class="fa-solid fa-folder" style="color:var(--accent2);font-size:18px;"></i>
        <span style="font-weight:700;">${escapeHtml(f.name)}</span>
      </div>
    `).join("");

    const itemCards = itemsHere.map(r => {
      const title = escapeHtml(r.title || "(Sin título)");
      const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      const url = r.image_url || "";
      const safeUrl = escapeHtml(url);
      const fileName = (r.file_name || (url ? parseFileNameFromUrl(url) : "")) || "";
      const id = r.id;
      const type = inferMatType(r);
      const iconClass = MAT_TYPE_ICON[type] || MAT_TYPE_ICON.image;
      const isLink = type === "link" || type === "link_spotify" || type === "link_youtube";

      const viewBtn = url
        ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="mat-icon-btn" title="Ver" aria-label="Ver"><i class="fa-solid fa-eye"></i></a>`
        : "";

      const downloadBtn = (url && !isLink)
        ? `<a href="${safeUrl}" download class="mat-icon-btn" title="Descargar" aria-label="Descargar"><i class="fa-solid fa-cloud-arrow-down"></i></a>`
        : "";

      return `
        <div class="mat-row">
          <div class="mat-row__name">
            <i class="${iconClass}" style="font-size:16px;color:var(--accent2);flex-shrink:0;"></i>
            <div style="min-width:0;">
              <div class="mat-row__title">${title}</div>
              <div class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(created)}${fileName ? ` • ${escapeHtml(fileName)}` : ''}</div>
            </div>
          </div>
          <div class="mat-row__actions">
            ${viewBtn}
            ${downloadBtn}
            <button type="button" class="mat-icon-btn" data-mat-toggle-move data-id="${escapeHtml(id)}" title="Mover" aria-label="Mover"><i class="fa-solid fa-up-down-left-right"></i></button>
            <select class="mat-move-select is-hidden" data-mat-move-select data-id="${escapeHtml(id)}" title="Carpeta destino">${buildFolderOptionsHtml(r.folder_id || "")}</select>
            <button type="button" class="mat-icon-btn" data-mat-action="delete" data-id="${escapeHtml(id)}" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    matEls.list.innerHTML = folderCards + itemCards;
  }

  // Abre/cierra el dropdown de "mover" para un material específico
  // (solo uno visible a la vez).
  matEls.list?.addEventListener("click", (ev) => {
    const toggleBtn = ev.target?.closest?.("[data-mat-toggle-move]");
    if (!toggleBtn) return;
    const id = toggleBtn.getAttribute("data-id");
    const select = matEls.list.querySelector(`select[data-mat-move-select][data-id="${CSS.escape(id)}"]`);
    if (!select) return;

    const wasHidden = select.classList.contains("is-hidden");
    matEls.list.querySelectorAll("select[data-mat-move-select]")
      .forEach(s => s.classList.add("is-hidden"));

    if (wasHidden) {
      select.classList.remove("is-hidden");
      select.focus();
      try { select.click(); } catch {}
    }
  });

  // Cierra cualquier dropdown de "mover" abierto al hacer click fuera de él
  document.addEventListener("click", (ev) => {
    if (ev.target.closest?.("[data-mat-toggle-move]") || ev.target.closest?.("select[data-mat-move-select]")) return;
    matEls.list?.querySelectorAll("select[data-mat-move-select]").forEach(s => s.classList.add("is-hidden"));
  });

  // Al elegir una carpeta en el dropdown, mueve el material de inmediato
  matEls.list?.addEventListener("change", async (ev) => {
    const select = ev.target?.closest?.("select[data-mat-move-select]");
    if (!select) return;
    const id = select.getAttribute("data-id");
    const targetFolderId = select.value || null;
    if (!id) return;

    if (matBusy) return;
    matBusy = true;
    select.disabled = true;

    try {
      const { error } = await supabase
        .from("materials")
        .update({ folder_id: targetFolderId })
        .eq("id", id);

      if (error) {
        setMatMsg(error.message, true);
        return;
      }

      setMatMsg("Material movido.", false);
      await loadMaterials();
    } finally {
      matBusy = false;
    }
  });

  matEls.list?.addEventListener("click", (ev) => {
    if (ev.target?.closest?.("button")) return;
    const folderCard = ev.target?.closest?.("[data-mat-open-folder]");
    if (!folderCard) return;
    matState.currentFolderId = folderCard.getAttribute("data-mat-open-folder");
    renderMatBreadcrumb();
    renderMatList();
  });

  async function loadMaterials() {
    if (matBusy) return;
    matBusy = true;
    try {
      if (matEls.list) matEls.list.innerHTML = '<div class="muted">Cargando…</div>';

      const [foldersRes, materialsRes] = await Promise.all([
        supabase
          .from("material_folders")
          .select("id, name, parent_id")
          .order("name", { ascending: true }),
        supabase
          .from("materials")
          .select("id, title, image_url, file_name, created_at, folder_id")
          .order("created_at", { ascending: false }),
      ]);

      if (foldersRes.error) {
        setMatMsg(foldersRes.error.message, true);
        matFoldersCache = [];
        matRows = [];
        renderMatFolderList();
        renderMatList();
        return;
      }
      if (materialsRes.error) {
        setMatMsg(materialsRes.error.message, true);
        matRows = [];
        renderMatList();
        return;
      }

      matFoldersCache = Array.isArray(foldersRes.data) ? foldersRes.data : [];
      matRows = Array.isArray(materialsRes.data) ? materialsRes.data : [];
      ensureValidMatFolder();
      refreshFolderSelects();
      renderMatFolderList();
      renderMatBreadcrumb();
      renderMatList();
      setMatMsg("", false);
    } finally {
      matBusy = false;
    }
  }

  function setMatPublishLoading(isLoading) {
    if (!matEls.btnPublish) return;
    if (!matEls.btnPublish.dataset.originalText) {
      matEls.btnPublish.dataset.originalText = matEls.btnPublish.textContent || "Publicar material";
    }

    if (!isLoading) {
      matEls.btnPublish.disabled = false;
      matEls.btnPublish.textContent = matEls.btnPublish.dataset.originalText;
      return;
    }

    matEls.btnPublish.disabled = true;
    matEls.btnPublish.textContent = "Procesando…";
  }

  matEls.btnPublish?.addEventListener("click", async () => {
    if (matBusy) return;

    const title = (matEls.title?.value || "").trim();
    const targetFolderId = matEls.targetFolder?.value || null;
    const isLinkKind = !!matEls.kindLink?.checked;

    if (isLinkKind) {
      const linkUrl = (matEls.linkUrl?.value || "").trim();
      if (!linkUrl) {
        setMatMsg("Ingresa la URL del enlace.", true);
        return;
      }

      matBusy = true;
      setMatPublishLoading(true);
      setMatMsg("Publicando enlace…", false);

      try {
        const { error: insErr } = await supabase
          .from("materials")
          .insert({
            title: title || null,
            image_url: linkUrl,
            file_name: null,
            folder_id: targetFolderId || null,
          });

        if (insErr) {
          setMatMsg(insErr.message, true);
          return;
        }

        if (matEls.title) matEls.title.value = "";
        if (matEls.linkUrl) matEls.linkUrl.value = "";

        setMatMsg("Enlace publicado.", false);
        await loadMaterials();
      } finally {
        setMatPublishLoading(false);
        matBusy = false;
      }
      return;
    }

    const file = matEls.file?.files?.[0] || null;

    if (!file) {
      setMatMsg("Selecciona un archivo.", true);
      return;
    }

    matBusy = true;
    setMatPublishLoading(true);
    setMatMsg("Subiendo material…", false);

    try {
      const ext = (file.name || "").split(".").pop() || "bin";
      const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "bin";
      const filePath = `mat_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`;

      const { error: upErr } = await supabase
        .storage
        .from("materials")
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });

      if (upErr) {
        setMatMsg(upErr.message, true);
        return;
      }

      const url = await getPublicOrSignedUrl("materials", filePath);
      if (!url) {
        setMatMsg("No se pudo obtener URL del archivo en Storage.", true);
        return;
      }

      const { error: insErr } = await supabase
        .from("materials")
        .insert({
          title: title || null,
          image_url: url,
          file_name: file.name || null,
          folder_id: targetFolderId || null,
        });

      if (insErr) {
        setMatMsg(insErr.message, true);
        return;
      }

      if (matEls.title) matEls.title.value = "";
      if (matEls.file) matEls.file.value = "";

      setMatMsg("Material publicado.", false);
      await loadMaterials();
    } finally {
      setMatPublishLoading(false);
      matBusy = false;
    }
  });

  matEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button[data-mat-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-mat-action");
    const id = btn.getAttribute("data-id");
    if (action !== "delete" || !id) return;

    if (matBusy) return;
    const ok = await showMatConfirm({
      title: "Eliminar material",
      body: "¿Eliminar este material? Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;

    matBusy = true;
    btn.disabled = true;

    try {
      const { error } = await supabase
        .from("materials")
        .delete()
        .eq("id", id);

      if (error) {
        setMatMsg(error.message, true);
        return;
      }

      setMatMsg("Material eliminado.", false);
      await loadMaterials();
    } finally {
      btn.disabled = false;
      matBusy = false;
    }
  });


  // -----------------------------
  // Administrar Usuarios
  // -----------------------------
  const ROLE_LABELS = {
    user: "Lider_de_Célula",
    leader: "Lider_de_Escuadron",
    admin: "Admin_del_App",
  };

  // Mismo agrupamiento que ALLOWED_SQUADS en la Edge Function bright-task.ts
  const SQUADS_BY_DIVISION = {
    makers: ["URM", "UVM", "UAM", "UNM", "UAZM"],
    takers: ["URT", "UVT", "UAT", "UNT", "UAZT"],
  };

  let usersCache = [];
  let usersActiveRole = "admin";
  let usersBusy = false;
  let usersSearchTerm = "";
  let usersDivisionFilter = "all";
  let usersSquadFilter = "all";

  function populateSquadFilterOptions(division) {
    const squadSelect = document.getElementById("usersFilterSquad");
    if (!squadSelect) return;

    const codes = division === "all"
      ? [...SQUADS_BY_DIVISION.makers, ...SQUADS_BY_DIVISION.takers]
      : (SQUADS_BY_DIVISION[division] || []);

    squadSelect.innerHTML = '<option value="all">Todos</option>';
    codes.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      squadSelect.appendChild(opt);
    });
    usersSquadFilter = "all";
  }

  function userPassesFilters(u) {
    if (usersSearchTerm) {
      const haystack = `${u.full_name || ""} ${u.email || ""}`.toLowerCase();
      if (!haystack.includes(usersSearchTerm)) return false;
    }
    if (usersDivisionFilter !== "all") {
      const divSquads = SQUADS_BY_DIVISION[usersDivisionFilter] || [];
      const belongs = (u.squads || []).some((s) => divSquads.includes(s));
      if (!belongs) return false;
    }
    if (usersSquadFilter !== "all") {
      if (!(u.squads || []).includes(usersSquadFilter)) return false;
    }
    return true;
  }

  async function loadAllUsers() {
    const tbody = document.getElementById("usersTbody");
    setMsg("usersMsg", "", false);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Cargando…</td></tr>';

    const { data, error } = await callManageUsersEdge(supabase, { action: "list" });

    if (error || !data?.ok) {
      setMsg("usersMsg", (data && data.error) || "No se pudo cargar la lista de usuarios.", true);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Error al cargar.</td></tr>';
      return;
    }

    usersCache = data.users || [];
    populateSquadFilterOptions(usersDivisionFilter);
    renderUsersTable(usersActiveRole);
  }

  function renderUsersTable(role) {
    usersActiveRole = role;
    const tbody = document.getElementById("usersTbody");
    if (!tbody) return;

    const rows = usersCache.filter((u) => u.role === role && userPassesFilters(u));
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Sin usuarios que coincidan con el filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = "";
    rows.forEach((u) => {
      const isSelf = u.id === user.id;
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.style.padding = "8px";
      tdName.textContent = u.full_name || "(sin nombre)";
      tr.appendChild(tdName);

      const tdEmail = document.createElement("td");
      tdEmail.style.padding = "8px";
      tdEmail.textContent = u.email || "—";
      tr.appendChild(tdEmail);

      const tdSquads = document.createElement("td");
      tdSquads.style.padding = "8px";
      tdSquads.textContent = (u.squads && u.squads.length) ? u.squads.join(", ") : "—";
      tr.appendChild(tdSquads);

      const tdStatus = document.createElement("td");
      tdStatus.style.padding = "8px";
      const statusSpan = document.createElement("span");
      statusSpan.className = u.active ? "badge-active" : "badge-suspended";
      statusSpan.textContent = u.active ? "Activo" : "Suspendido";
      tdStatus.appendChild(statusSpan);
      tr.appendChild(tdStatus);

      const tdRole = document.createElement("td");
      tdRole.style.padding = "8px";
      if (isSelf) {
        tdRole.textContent = ROLE_LABELS[u.role] + " (vos)";
      } else {
        const select = document.createElement("select");
        Object.keys(ROLE_LABELS).forEach((r) => {
          const opt = document.createElement("option");
          opt.value = r;
          opt.textContent = ROLE_LABELS[r];
          if (r === u.role) opt.selected = true;
          select.appendChild(opt);
        });
        select.addEventListener("change", async () => {
          if (usersBusy) { select.value = u.role; return; }
          const newRole = select.value;
          const ok = window.confirm(`¿Cambiar el rol de ${u.full_name || u.email} a "${ROLE_LABELS[newRole]}"?`);
          if (!ok) { select.value = u.role; return; }

          usersBusy = true;
          select.disabled = true;
          const { data, error } = await callManageUsersEdge(supabase, {
            action: "update",
            user_id: u.id,
            role: newRole,
          });
          usersBusy = false;
          select.disabled = false;

          if (error || !data?.ok) {
            setMsg("usersMsg", (data && data.error) || "No se pudo cambiar el rol.", true);
            select.value = u.role;
            return;
          }
          setMsg("usersMsg", "Rol actualizado.", false);
          await loadAllUsers();
        });
        tdRole.appendChild(select);
      }
      tr.appendChild(tdRole);

      const tdActions = document.createElement("td");
      tdActions.style.padding = "8px";
      tdActions.style.display = "flex";
      tdActions.style.gap = "8px";
      tdActions.style.flexWrap = "wrap";

      if (!isSelf) {
        const btnToggle = document.createElement("button");
        btnToggle.type = "button";
        btnToggle.className = "secondary users-action-btn";
        btnToggle.textContent = u.active ? "Block" : "Activar";
        btnToggle.addEventListener("click", async () => {
          if (usersBusy) return;
          const newActive = !u.active;
          const verb = newActive ? "activar" : "suspender";
          const ok = window.confirm(`¿Seguro que querés ${verb} a ${u.full_name || u.email}?`);
          if (!ok) return;

          usersBusy = true;
          btnToggle.disabled = true;
          const { data, error } = await callManageUsersEdge(supabase, {
            action: "update",
            user_id: u.id,
            active: newActive,
          });
          usersBusy = false;
          btnToggle.disabled = false;

          if (error || !data?.ok) {
            setMsg("usersMsg", (data && data.error) || "No se pudo actualizar el estado.", true);
            return;
          }
          setMsg("usersMsg", newActive ? "Usuario activado." : "Usuario suspendido.", false);
          await loadAllUsers();
        });
        tdActions.appendChild(btnToggle);
      }

      const btnReset = document.createElement("button");
      btnReset.type = "button";
      btnReset.className = "secondary users-action-btn";
      btnReset.textContent = "Reset passw";
      btnReset.addEventListener("click", async () => {
        if (!u.email) {
          setMsg("usersMsg", "Este usuario no tiene email registrado.", true);
          return;
        }
        const ok = window.confirm(`¿Enviar email de recuperación de contraseña a ${u.email}?`);
        if (!ok) return;

        btnReset.disabled = true;
        const redirectTo = new URL("./reset-password.html", window.location.href).toString();
        const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo });
        btnReset.disabled = false;

        if (error) {
          setMsg("usersMsg", error.message || "No se pudo enviar el email de recuperación.", true);
          return;
        }
        setMsg("usersMsg", `Email de recuperación enviado a ${u.email}.`, false);
      });
      tdActions.appendChild(btnReset);

      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  function setUsersTabActive(id) {
    ["usersTabAdmin", "usersTabLeader", "usersTabUser"].forEach((tid) => {
      document.getElementById(tid)?.classList.toggle("active", tid === id);
    });
  }

  document.getElementById("usersTabAdmin")?.addEventListener("click", () => {
    setUsersTabActive("usersTabAdmin");
    renderUsersTable("admin");
  });
  document.getElementById("usersTabLeader")?.addEventListener("click", () => {
    setUsersTabActive("usersTabLeader");
    renderUsersTable("leader");
  });
  document.getElementById("usersTabUser")?.addEventListener("click", () => {
    setUsersTabActive("usersTabUser");
    renderUsersTable("user");
  });

  document.getElementById("usersSearch")?.addEventListener("input", (ev) => {
    usersSearchTerm = (ev.target.value || "").trim().toLowerCase();
    renderUsersTable(usersActiveRole);
  });

  document.getElementById("usersFilterDivision")?.addEventListener("change", (ev) => {
    usersDivisionFilter = ev.target.value;
    populateSquadFilterOptions(usersDivisionFilter);
    renderUsersTable(usersActiveRole);
  });

  document.getElementById("usersFilterSquad")?.addEventListener("change", (ev) => {
    usersSquadFilter = ev.target.value;
    renderUsersTable(usersActiveRole);
  });

})();
