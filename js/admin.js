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
    anuncios: document.getElementById("sectionAnuncios"),
    calendario: document.getElementById("sectionCalendario"),
    materials: document.getElementById("sectionMaterials"),
    users: document.getElementById("sectionUsers"),
  };

  function showSection(key) {
    Object.values(sections).forEach(el => el?.classList.remove("active"));
    sections[key]?.classList.add("active");
    setActiveSideNav(key);
  }

  const goInvite = () => showSection("invite");
  const goAnuncios = async () => { showSection("anuncios"); await loadAnuncios(); };
  const goCalendario = async () => { showSection("calendario"); await loadCalendarioPosts(); };
  const goMaterials = async () => { showSection("materials"); await loadMaterials(); };
  const goUsers = async () => { showSection("users"); await loadAllUsers(); };
  const goHome = () => showSection("home");

  // Menu buttons (tarjetas de Inicio)
  document.getElementById("navInvite")?.addEventListener("click", goInvite);
  document.getElementById("navAnuncios")?.addEventListener("click", goAnuncios);
  document.getElementById("navCalendario")?.addEventListener("click", goCalendario);
  document.getElementById("navMaterials")?.addEventListener("click", goMaterials);
  document.getElementById("navUsers")?.addEventListener("click", goUsers);

  // Mismos destinos, desde el sidebar
  document.getElementById("sideNavInvite")?.addEventListener("click", goInvite);
  document.getElementById("sideNavAnuncios")?.addEventListener("click", goAnuncios);
  document.getElementById("sideNavCalendario")?.addEventListener("click", goCalendario);
  document.getElementById("sideNavMaterials")?.addEventListener("click", goMaterials);

  // "Bitácora": no es una sección interna del panel (por eso no está en
  // `sections`), navega de verdad a app.html — mismo patrón que el botón
  // "Admin" del sidebar de app.html.
  document.getElementById("navBitacoraLink")?.addEventListener("click", () => {
    window.location.href = "./app.html";
  });
  document.getElementById("sideNavUsers")?.addEventListener("click", goUsers);
  document.getElementById("btnGoHome")?.addEventListener("click", goHome);

  function setActiveSideNav(key) {
    const idByKey = {
      invite: "sideNavInvite",
      anuncios: "sideNavAnuncios",
      calendario: "sideNavCalendario",
      materials: "sideNavMaterials",
      users: "sideNavUsers",
    };
    document.querySelectorAll(".sidebar .nav-btn[data-nav]").forEach(btn => {
      btn.classList.toggle("is-active", btn.id === idByKey[key]);
    });
  }

  // Back to home buttons
  document.getElementById("backFromInvite")?.addEventListener("click", goHome);
  document.getElementById("backFromAnuncios")?.addEventListener("click", goHome);
  document.getElementById("backFromCalendario")?.addEventListener("click", goHome);
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

    const squads = Array.from(document.querySelectorAll('input[name="inviteSquad"]:checked'))
      .map(x => (x.value || "").trim())
      .filter(Boolean);

    // División ya no se pide en el form: se deriva del sufijo del squad
    // (...M = makers, ...T = takers). Mismo contrato que espera bright-task.
    const divisions = Array.from(new Set(
      squads
        .map(s => s.endsWith("M") ? "makers" : (s.endsWith("T") ? "takers" : null))
        .filter(Boolean)
    ));

    if (!email) return setMsg("msg", "Falta email.", true);
    if (!full_name) return setMsg("msg", "Falta nombre completo.", true);

    // division/squad_code singulares deprecados (Opción A, ago 2026):
    // bright-task ya no los lee ni los persiste en profiles. Se manda solo
    // el contrato multi (divisions/squads); la fuente de verdad son
    // leader_squads/user_squads.
    const payload = { email, full_name, role, divisions, squads };

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
  // Anuncios (actividades: tabla "calendar_activities") — CRUD
  // -----------------------------
  const anuncioEls = {
    activity: document.getElementById("annActivity"),
    eventDate: document.getElementById("annEventDate"),
    ownerName: document.getElementById("annOwnerName"),
    contactPhone: document.getElementById("annContactPhone"),
    investment: document.getElementById("annInvestment"),
    btnSave: document.getElementById("annBtnSave"),
    btnCancel: document.getElementById("annBtnCancel"),
    tbody: document.getElementById("annTbody"),
  };

  let anuncioSelectedId = null;
  let anuncioRows = [];
  let anuncioBusy = false;

  function safeText(v) {
    return (v ?? "").toString();
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // Ordena la tabla de Anuncios: activas primero (las más próximas primero),
  // vencidas (fecha < hoy) al final (la más recientemente vencida arriba
  // dentro de ese grupo). Mismo criterio que usa app.js (vista de usuario).
  function sortAnuncioActivities(rows) {
    const todayStr = todayISO();
    const active = [];
    const expired = [];
    (rows || []).forEach(r => {
      if (r.event_date && r.event_date < todayStr) expired.push(r);
      else active.push(r);
    });
    active.sort((a, b) => (a.event_date || "").localeCompare(b.event_date || ""));
    expired.sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""));
    return [...active, ...expired];
  }

  // Rango (ISO YYYY-MM-DD) lunes–domingo de la semana actual, para resaltar
  // en la tabla las actividades cuya fecha caiga dentro de ella.
  function anuncioCurrentWeekRangeISO() {
    const now = new Date();
    const day = now.getDay(); // 0=domingo .. 6=sábado
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return {
      mondayISO: monday.toISOString().slice(0, 10),
      sundayISO: sunday.toISOString().slice(0, 10),
    };
  }

  function fmtMoney(v) {
    if (v === null || v === undefined || v === "") return "";
    const num = Number(v);
    if (Number.isNaN(num)) return safeText(v);
    return num.toLocaleString("es-CR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function setAnuncioMsg(text, isError) {
    setMsg("annMsg", text, !!isError);
  }

  function setAnuncioSaveLabel(text) {
    if (!anuncioEls.btnSave) return;
    anuncioEls.btnSave.title = text;
    anuncioEls.btnSave.setAttribute("aria-label", text);
  }

  function setAnuncioSaveLoading(isLoading, idleText) {
    if (!anuncioEls.btnSave) return;
    if (!anuncioEls.btnSave.dataset.originalText) {
      anuncioEls.btnSave.dataset.originalText = anuncioEls.btnSave.title || "Crear actividad";
    }

    if (!isLoading) {
      anuncioEls.btnSave.disabled = false;
      setAnuncioSaveLabel(idleText || anuncioEls.btnSave.dataset.originalText);
      return;
    }

    anuncioEls.btnSave.disabled = true;
    setAnuncioSaveLabel("Procesando…");
  }

  function setAnuncioCancelVisible(isVisible) {
    if (!anuncioEls.btnCancel) return;
    anuncioEls.btnCancel.style.display = isVisible ? "" : "none";
  }

  function resetAnuncioForm() {
    anuncioSelectedId = null;
    if (anuncioEls.activity) anuncioEls.activity.value = "";
    if (anuncioEls.eventDate) anuncioEls.eventDate.value = "";
    if (anuncioEls.ownerName) anuncioEls.ownerName.value = "";
    if (anuncioEls.contactPhone) anuncioEls.contactPhone.value = "";
    if (anuncioEls.investment) anuncioEls.investment.value = "";
    setAnuncioSaveLabel("Crear actividad");
    if (anuncioEls.btnSave) anuncioEls.btnSave.dataset.originalText = "Crear actividad";
    setAnuncioCancelVisible(false);
  }

  function readAnuncioForm() {
    const activity = (anuncioEls.activity?.value || "").trim();
    const event_date = (anuncioEls.eventDate?.value || "").trim();
    const owner_name = (anuncioEls.ownerName?.value || "").trim();
    const contact_phone = (anuncioEls.contactPhone?.value || "").trim();
    const invRaw = (anuncioEls.investment?.value || "").toString().trim();
    const investment = invRaw === "" ? null : Number(invRaw);

    return { activity, event_date, owner_name, contact_phone, investment };
  }

  function validateAnuncioPayload(p) {
    if (!p.activity) return "Falta Actividad.";
    if (!p.event_date) return "Falta Fecha.";
    if (p.investment !== null && Number.isNaN(p.investment)) return "Inversión inválida.";
    return null;
  }

  function renderAnuncioTable() {
    if (!anuncioEls.tbody) return;

    if (!Array.isArray(anuncioRows) || anuncioRows.length === 0) {
      anuncioEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">No hay actividades.</td></tr>';
      return;
    }

    const curRange = anuncioCurrentWeekRangeISO();
    const todayStr = todayISO();

    anuncioEls.tbody.innerHTML = anuncioRows.map(r => {
      const id = safeText(r.id);
      const activity = safeText(r.activity);
      const date = safeText(r.event_date);
      const owner = safeText(r.owner_name);
      const phone = safeText(r.contact_phone);
      const inv = fmtMoney(r.investment);

      const inCurrentWeek = !!(r.event_date && r.event_date >= curRange.mondayISO && r.event_date <= curRange.sundayISO);
      const isExpired = !!(r.event_date && r.event_date < todayStr);
      const rowClasses = [
        inCurrentWeek ? "ann-row--current" : "",
        isExpired ? "ann-row--expired" : "",
      ].filter(Boolean).join(" ");
      const rowClassAttr = rowClasses ? ` class="${rowClasses}"` : "";

      return `
        <tr data-row-id="${id}"${rowClassAttr}>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${activity}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${date}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${owner}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${phone}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);">${inv}</td>
          <td class="ann-actions" style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.08);white-space:nowrap;">
            <button data-action="edit" data-id="${id}" class="mat-icon-btn" style="margin-right:6px;" title="Editar" aria-label="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button data-action="delete" data-id="${id}" class="mat-icon-btn" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async function loadAnuncios() {
    if (anuncioBusy) return;
    anuncioBusy = true;
    try {
      if (anuncioEls.tbody) {
        anuncioEls.tbody.innerHTML = '<tr><td colspan="6" style="padding:10px;" class="muted">Cargando…</td></tr>';
      }

      const { data, error } = await supabase
        .from("calendar_activities")
        .select("*")
        .order("event_date", { ascending: true });

      if (error) {
        setAnuncioMsg(error.message, true);
        anuncioRows = [];
        renderAnuncioTable();
        return;
      }

      anuncioRows = sortAnuncioActivities(Array.isArray(data) ? data : []);
      renderAnuncioTable();
      setAnuncioMsg("", false);
    } finally {
      anuncioBusy = false;
    }
  }

  function fillFormForEdit(row) {
    anuncioSelectedId = row.id;
    if (anuncioEls.activity) anuncioEls.activity.value = row.activity ?? "";
    if (anuncioEls.eventDate) anuncioEls.eventDate.value = row.event_date ?? "";
    if (anuncioEls.ownerName) anuncioEls.ownerName.value = row.owner_name ?? "";
    if (anuncioEls.contactPhone) anuncioEls.contactPhone.value = row.contact_phone ?? "";
    if (anuncioEls.investment) anuncioEls.investment.value = row.investment ?? "";

    setAnuncioSaveLabel("Guardar cambios");
    setAnuncioCancelVisible(true);

    setAnuncioMsg("Editando actividad…", false);
  }

  anuncioEls.btnCancel?.addEventListener("click", () => {
    resetAnuncioForm();
    setAnuncioMsg("", false);
  });

  anuncioEls.btnSave?.addEventListener("click", async () => {
    if (anuncioBusy) return;

    const payload = readAnuncioForm();
    const err = validateAnuncioPayload(payload);
    if (err) {
      setAnuncioMsg(err, true);
      return;
    }

    anuncioBusy = true;
    setAnuncioSaveLoading(true);

    try {
      if (!anuncioSelectedId) {
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
          setAnuncioMsg(error.message, true);
          return;
        }

        setAnuncioMsg("Actividad creada.", false);
        resetAnuncioForm();
        await loadAnuncios();
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
        .eq("id", anuncioSelectedId);

      if (error) {
        setAnuncioMsg(error.message, true);
        return;
      }

      setAnuncioMsg("Cambios guardados.", false);
      resetAnuncioForm();
      await loadAnuncios();
    } finally {
      setAnuncioSaveLoading(false, anuncioSelectedId ? "Guardar cambios" : "Crear actividad");
      anuncioBusy = false;
    }
  });

  // Delegación de acciones (Editar/Eliminar)
  anuncioEls.tbody?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!action || !id) return;

    const row = anuncioRows.find(x => String(x.id) === String(id));
    if (!row) return;

    if (action === "edit") {
      fillFormForEdit(row);
      return;
    }

    if (action === "delete") {
      if (anuncioBusy) return;
      const ok = window.confirm("¿Eliminar esta actividad? Esta acción no se puede deshacer.");
      if (!ok) return;

      anuncioBusy = true;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Procesando…";

      try {
        const { error } = await supabase
          .from("calendar_activities")
          .delete()
          .eq("id", id);

        if (error) {
          setAnuncioMsg(error.message, true);
          return;
        }

        setAnuncioMsg("Actividad eliminada.", false);
        if (String(anuncioSelectedId) === String(id)) resetAnuncioForm();
        await loadAnuncios();
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
        anuncioBusy = false;
      }
    }
  });

  // Carga inicial del menu
  showSection("home");


  // -----------------------------
  // Calendario (imágenes/avisos visuales: subir a Storage + registrar en tabla "announcements")
  // -----------------------------
  const calEls = {
    title: document.getElementById("calTitle"),
    file: document.getElementById("calFile"),
    btnPublish: document.getElementById("calBtnPublish"),
    list: document.getElementById("calList"),
  };

  let calBusy = false;
  let calRows = [];

  function setCalMsg(text, isError) {
    setMsg("calMsg", text, !!isError);
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

  function renderCalList() {
    if (!calEls.list) return;

    if (!Array.isArray(calRows) || calRows.length === 0) {
      calEls.list.innerHTML = '<div class="muted">No hay anuncios.</div>';
      return;
    }

    calEls.list.innerHTML = calRows.map(r => {
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
            <button data-cal-action="delete" data-id="${escapeHtml(id)}" class="mat-icon-btn" type="button" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");
  }

  async function loadCalendarioPosts() {
    if (calBusy) return;
    calBusy = true;
    try {
      if (calEls.list) calEls.list.innerHTML = '<div class="muted">Cargando…</div>';

      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, image_url, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        setCalMsg(error.message, true);
        calRows = [];
        renderCalList();
        return;
      }

      calRows = Array.isArray(data) ? data : [];
      renderCalList();
      setCalMsg("", false);
    } finally {
      calBusy = false;
    }
  }

  function setCalPublishLoading(isLoading) {
    if (!calEls.btnPublish) return;
    if (!calEls.btnPublish.dataset.originalText) {
      calEls.btnPublish.dataset.originalText = calEls.btnPublish.textContent || "Publicar anuncio";
    }

    if (!isLoading) {
      calEls.btnPublish.disabled = false;
      calEls.btnPublish.textContent = calEls.btnPublish.dataset.originalText;
      return;
    }

    calEls.btnPublish.disabled = true;
    calEls.btnPublish.textContent = "Procesando…";
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

  // Reconstruye el path real del objeto en Storage a partir de la URL
  // guardada en la tabla (image_url). No hay columna que guarde el path
  // "crudo" (filePath) por separado, así que hay que parsearlo desde la URL.
  // Cubre tanto URL pública (/object/public/<bucket>/<path>) como firmada
  // (/object/sign/<bucket>/<path>?token=...), por si algún registro viejo
  // se guardó con signed URL (fallback de getPublicOrSignedUrl).
  function extractStoragePathFromUrl(bucket, url) {
    if (!url) return null;
    try {
      const marker = `/object/public/${bucket}/`;
      const signMarker = `/object/sign/${bucket}/`;
      let idx = url.indexOf(marker);
      let raw;
      if (idx !== -1) {
        raw = url.slice(idx + marker.length);
      } else {
        idx = url.indexOf(signMarker);
        if (idx === -1) return null;
        raw = url.slice(idx + signMarker.length).split('?')[0];
      }
      return raw ? decodeURIComponent(raw) : null;
    } catch {
      return null;
    }
  }

  // Borra el archivo real en Storage si existe. No es fatal si falla (el
  // registro en la tabla igual se borra) — solo se loguea para no dejar al
  // usuario colgado con un error de storage al borrar contenido.
  async function tryDeleteStorageObject(bucket, url) {
    const path = extractStoragePathFromUrl(bucket, url);
    if (!path) return;
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) console.warn(`No se pudo borrar el archivo en Storage (${bucket}/${path}):`, error.message);
    } catch (e) {
      console.warn(`Error borrando archivo en Storage (${bucket}/${path}):`, e);
    }
  }

  calEls.btnPublish?.addEventListener("click", async () => {
    if (calBusy) return;

    const title = (calEls.title?.value || "").trim();
    const file = calEls.file?.files?.[0] || null;

    if (!file) {
      setCalMsg("Selecciona una imagen.", true);
      return;
    }

    calBusy = true;
    setCalPublishLoading(true);
    setCalMsg("Subiendo anuncio…", false);

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
        setCalMsg(upErr.message, true);
        return;
      }

      const url = await getPublicOrSignedUrl("announcements", filePath);
      if (!url) {
        setCalMsg("No se pudo obtener URL del archivo en Storage.", true);
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
        setCalMsg(insErr.message, true);
        return;
      }

      if (calEls.title) calEls.title.value = "";
      if (calEls.file) calEls.file.value = "";

      setCalMsg("Anuncio publicado.", false);
      await loadCalendarioPosts();
    } finally {
      setCalPublishLoading(false);
      calBusy = false;
    }
  });

  calEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button");
    if (!btn) return;
    const action = btn.getAttribute("data-cal-action");
    const id = btn.getAttribute("data-id");
    if (action !== "delete" || !id) return;

    if (calBusy) return;
    const ok = window.confirm("¿Eliminar este anuncio? Esta acción no se puede deshacer.");
    if (!ok) return;

    calBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Procesando…";

    try {
      const row = calRows.find(r => r.id === id);

      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);

      if (error) {
        setCalMsg(error.message, true);
        return;
      }

      if (row?.image_url) await tryDeleteStorageObject("announcements", row.image_url);

      setCalMsg("Anuncio eliminado.", false);
      await loadCalendarioPosts();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText || "Eliminar";
      calBusy = false;
    }
  });

  // -----------------------------
  // Material de apoyo (subir imagen a Storage + registrar en tabla)
  // -----------------------------
  // Carpetas: tabla `material_folders` en Supabase (paso 3).
  // `materials.folder_id` referencia esa tabla (null = raíz).

  const MAT_TYPE_ICON = {
    folder: "fa-solid fa-folder",
    word:   "fa-solid fa-file-word",
    image:  "fa-solid fa-image",
    pdf:    "fa-solid fa-file-pdf",
    ppt:    "fa-solid fa-file-powerpoint",
  };

  // Detección de plataforma para el ícono del enlace (chip clickeable
  // aparte del archivo, o ícono principal si el material es solo enlace).
  const LINK_ICON_RULES = [
    { re: /spotify\.com/i,                    icon: "fa-brands fa-spotify" },
    { re: /youtube\.com|youtu\.be/i,          icon: "fa-brands fa-youtube" },
    { re: /tiktok\.com/i,                     icon: "fa-brands fa-tiktok" },
    { re: /wa\.me|whatsapp\.com/i,            icon: "fa-brands fa-whatsapp" },
    { re: /facebook\.com|fb\.watch/i,         icon: "fa-brands fa-facebook" },
    { re: /instagram\.com/i,                  icon: "fa-brands fa-instagram" },
  ];
  function inferLinkIcon(url) {
    const u = String(url || "");
    const rule = LINK_ICON_RULES.find(r => r.re.test(u));
    return rule ? rule.icon : "fa-solid fa-link";
  }

  // Un material puede tener archivo, enlace, o ambos a la vez (ver popup
  // "Archivo"). `link_url` es la columna dedicada al enlace secundario;
  // se conserva compatibilidad con filas antiguas que guardaban el enlace
  // directamente en `image_url` (cuando no tenían archivo).
  function matHasFile(r) {
    return !!(r && r.file_name && r.image_url);
  }
  function matEffectiveLink(r) {
    if (!r) return "";
    if (r.link_url) return r.link_url;
    if (!r.file_name && r.image_url && /^https?:\/\//i.test(r.image_url)) return r.image_url;
    return "";
  }

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
  // Id de la carpeta + todas sus subcarpetas (recursivo). Se usa para evitar
  // mover una carpeta dentro de sí misma o de un descendiente suyo.
  function getMatFolderDescendantIds(id) {
    const ids = new Set([id]);
    let added = true;
    while (added) {
      added = false;
      matFoldersCache.forEach(f => {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id);
          added = true;
        }
      });
    }
    return ids;
  }
  // Si la carpeta actual ya no existe (p. ej. se eliminó en otra sesión), vuelve a la raíz.
  function ensureValidMatFolder() {
    if (matState.currentFolderId && !getMatFolderById(matState.currentFolderId)) {
      matState.currentFolderId = null;
    }
  }
  // Tipo de ÍCONO DE ARCHIVO (solo aplica cuando el material tiene archivo;
  // los enlaces se resuelven aparte con inferLinkIcon/matEffectiveLink).
  function inferMatType(row) {
    const url = row.image_url || "";
    const name = (row.file_name || url || "").toLowerCase();
    if (/\.pdf(\?|$)/.test(name)) return "pdf";
    if (/\.(docx?|rtf)(\?|$)/.test(name)) return "word";
    if (/\.(pptx?|key)(\?|$)/.test(name)) return "ppt";
    if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(name)) return "image";
    return "image";
  }

  // Tipo usado para ORDENAR (distinto del ícono): agrupa archivo (por
  // extensión) o enlace, alfabéticamente. Se usa en renderMatList para
  // ordenar "primero por tipo, después por nombre".
  function matSortTypeLabel(row) {
    if (matHasFile(row)) return inferMatType(row); // 'image' | 'pdf' | 'ppt' | 'word'
    if (matEffectiveLink(row)) return "link";
    return "zzz"; // caso raro: sin archivo ni enlace, al final
  }

  // Construye <option> jerárquicos indentados para los selects de carpeta.
  // selectedId (opcional) marca la opción actual como seleccionada.
  // excludeIds (opcional, Set) omite esas carpetas y todo su subárbol
  // (se usa al mover una carpeta, para no poder moverla dentro de sí misma).
  function buildFolderOptionsHtml(selectedId, excludeIds) {
    const sel = selectedId || "";
    const renderLevel = (parentId, depth) => matFoldersCache
      .filter(f => (f.parent_id || null) === (parentId || null))
      .filter(f => !excludeIds || !excludeIds.has(f.id))
      .map(f => {
        const indent = "\u2003".repeat(depth);
        const isSel = f.id === sel ? " selected" : "";
        return `<option value="${escapeHtml(f.id)}"${isSel}>${indent}${escapeHtml(f.name)}</option>` + renderLevel(f.id, depth + 1);
      }).join("");
    const rootSel = !sel ? " selected" : "";
    return `<option value=""${rootSel}>— Raíz —</option>` + renderLevel(null, 0);
  }

  const matEls = {
    list: document.getElementById("matList"),
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

  // Renombrar carpeta/material: reutiliza el mismo modal visual que
  // showMatConfirm (mismo lenguaje visual que app.html), pero reemplaza el
  // cuerpo por un <input> y el botón OK pasa de "danger" (Eliminar) a
  // "primary" (Guardar). Devuelve el nombre nuevo (trim) o null si se
  // canceló / quedó vacío.
  function showMatPrompt({ title = "Renombrar", initialValue = "", confirmLabel = "Guardar" } = {}) {
    return new Promise((resolve) => {
      if (!matConfirmModal) {
        const val = window.prompt(title, initialValue);
        resolve(val === null ? null : val.trim() || null);
        return;
      }

      if (matConfirmModalTitle) matConfirmModalTitle.textContent = title;
      if (matConfirmModalBody) {
        matConfirmModalBody.innerHTML = "";
        const input = document.createElement("input");
        input.type = "text";
        input.id = "matPromptInput";
        input.value = initialValue;
        matConfirmModalBody.appendChild(input);
      }
      if (matConfirmModalOk) {
        matConfirmModalOk.textContent = confirmLabel;
        matConfirmModalOk.classList.remove("mat-modal-btn--danger");
        matConfirmModalOk.classList.add("mat-modal-btn--primary");
      }
      matConfirmModal.classList.remove("is-hidden");

      const input = document.getElementById("matPromptInput");
      setTimeout(() => { input?.focus(); input?.select(); }, 0);

      const restoreOkStyle = () => {
        matConfirmModalOk?.classList.remove("mat-modal-btn--primary");
        matConfirmModalOk?.classList.add("mat-modal-btn--danger");
      };
      const cleanup = (result) => {
        matConfirmModal.classList.add("is-hidden");
        restoreOkStyle();
        matConfirmModalOk?.removeEventListener("click", onOk);
        matConfirmModalCancel?.removeEventListener("click", onCancel);
        matConfirmModal.removeEventListener("click", onOverlay);
        input?.removeEventListener("keydown", onKeydown);
        resolve(result);
      };
      const onOk = () => cleanup((input?.value || "").trim() || null);
      const onCancel = () => cleanup(null);
      const onOverlay = (e) => { if (e.target === matConfirmModal) cleanup(null); };
      const onKeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); onOk(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      };

      matConfirmModalOk?.addEventListener("click", onOk);
      matConfirmModalCancel?.addEventListener("click", onCancel);
      matConfirmModal.addEventListener("click", onOverlay);
      input?.addEventListener("keydown", onKeydown);
    });
  }

  const matState = { currentFolderId: null };

  let matBusy = false;
  let matRows = [];

  function setMatMsg(text, isError) {
    setMsg("matMsg", text, !!isError);
  }

  // -----------------------------
  // Selector de carpeta estilo explorador (Windows-like), compartido por
  // el popup "Archivo" (campo Carpeta) y el popup "Carpeta" (campo Ubicación).
  // -----------------------------
  const matPickerModal = document.getElementById("matFolderPickerModal");
  const matPickerBreadcrumb = document.getElementById("matPickerBreadcrumb");
  const matPickerList = document.getElementById("matPickerList");
  const matPickerCancelBtn = document.getElementById("matPickerCancel");
  const matPickerSelectBtn = document.getElementById("matPickerSelect");

  const matPicker = { folderId: null, excludeIds: null, onConfirm: null };

  function renderMatPicker() {
    if (!matPickerBreadcrumb || !matPickerList) return;

    const path = getMatFolderPath(matPicker.folderId);
    let crumbHtml = `<button type="button" class="secondary users-action-btn" data-mat-picker-crumb="">Raíz</button>`;
    path.forEach(f => {
      crumbHtml += ` <span class="muted">/</span> <button type="button" class="secondary users-action-btn" data-mat-picker-crumb="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`;
    });
    matPickerBreadcrumb.innerHTML = crumbHtml;

    const children = getMatFolderChildren(matPicker.folderId)
      .filter(f => !matPicker.excludeIds || !matPicker.excludeIds.has(f.id));

    if (!children.length) {
      matPickerList.innerHTML = '<div class="mat-picker-empty">No hay subcarpetas aquí.</div>';
      return;
    }

    matPickerList.innerHTML = children.map(f => `
      <div class="mat-picker-row" data-mat-picker-open="${escapeHtml(f.id)}">
        <i class="fa-solid fa-folder"></i>
        <span>${escapeHtml(f.name)}</span>
      </div>
    `).join("");
  }

  matPickerList?.addEventListener("click", (ev) => {
    const row = ev.target?.closest?.("[data-mat-picker-open]");
    if (!row) return;
    matPicker.folderId = row.getAttribute("data-mat-picker-open") || null;
    renderMatPicker();
  });

  matPickerBreadcrumb?.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("[data-mat-picker-crumb]");
    if (!btn) return;
    matPicker.folderId = btn.getAttribute("data-mat-picker-crumb") || null;
    renderMatPicker();
  });

  function openMatFolderPicker({ initialFolderId = null, excludeIds = null, onConfirm } = {}) {
    matPicker.folderId = initialFolderId || null;
    matPicker.excludeIds = excludeIds || null;
    matPicker.onConfirm = typeof onConfirm === "function" ? onConfirm : null;
    renderMatPicker();
    matPickerModal?.classList.remove("is-hidden");
  }
  function closeMatFolderPicker() {
    matPickerModal?.classList.add("is-hidden");
  }
  matPickerCancelBtn?.addEventListener("click", closeMatFolderPicker);
  matPickerModal?.addEventListener("click", (ev) => {
    if (ev.target === matPickerModal) closeMatFolderPicker();
  });
  matPickerSelectBtn?.addEventListener("click", () => {
    const folderId = matPicker.folderId || null;
    const cb = matPicker.onConfirm;
    closeMatFolderPicker();
    if (cb) cb(folderId);
  });

  function folderLabelFor(folderId) {
    if (!folderId) return "— Raíz —";
    const f = getMatFolderById(folderId);
    return f ? f.name : "— Raíz —";
  }

  // -----------------------------
  // Popup: subir Archivo y/o Enlace
  // -----------------------------
  const matFileModal = document.getElementById("matFileModal");
  const matModalTitleInput = document.getElementById("matModalTitle");
  const matModalFilePickBtn = document.getElementById("matModalFilePickBtn");
  const matModalFileInput = document.getElementById("matModalFileInput");
  const matModalFileName = document.getElementById("matModalFileName");
  const matModalLinkUrl = document.getElementById("matModalLinkUrl");
  const matModalFolderPickBtn = document.getElementById("matModalFolderPickBtn");
  const matModalFolderName = document.getElementById("matModalFolderName");
  const matFileModalCancelBtn = document.getElementById("matFileModalCancel");
  const matFileModalSaveBtn = document.getElementById("matFileModalSave");

  const matFileModalState = { folderId: null };

  function setMatFileModalMsg(text, isError) {
    setMsg("matFileModalMsg", text, !!isError);
  }

  function openMatFileModal() {
    if (matModalTitleInput) {
      matModalTitleInput.value = "";
      matModalTitleInput.disabled = false;
      matModalTitleInput.placeholder = "Ej: Manual de discipulado";
    }
    if (matModalFileInput) matModalFileInput.value = "";
    if (matModalFileName) matModalFileName.textContent = "Seleccionar o arrastrar archivo(s)…";
    if (matModalLinkUrl) matModalLinkUrl.value = "";
    matFileModalState.folderId = matState.currentFolderId || null;
    if (matModalFolderName) matModalFolderName.textContent = folderLabelFor(matFileModalState.folderId);
    setMatFileModalMsg("", false);
    matFileModal?.classList.remove("is-hidden");
  }
  function closeMatFileModal() {
    matFileModal?.classList.add("is-hidden");
  }

  document.getElementById("matBtnOpenFileModal")?.addEventListener("click", openMatFileModal);
  matFileModalCancelBtn?.addEventListener("click", closeMatFileModal);
  matFileModal?.addEventListener("click", (ev) => {
    if (ev.target === matFileModal) closeMatFileModal();
  });

  matModalFilePickBtn?.addEventListener("click", () => matModalFileInput?.click());

  // Actualiza el label del botón y el campo Título según cuántos archivos
  // hay seleccionados. Con 1 archivo: comportamiento de siempre (título
  // manual opcional). Con varios: el título se ignora (cada archivo usa su
  // propio nombre), así que el campo se deshabilita para no confundir.
  function updateMatModalFileLabel() {
    const files = matModalFileInput?.files;
    const count = files ? files.length : 0;
    if (!matModalFileName) return;

    if (count === 0) {
      matModalFileName.textContent = "Seleccionar o arrastrar archivo(s)…";
      if (matModalTitleInput) {
        matModalTitleInput.disabled = false;
        matModalTitleInput.placeholder = "Ej: Manual de discipulado";
      }
    } else if (count === 1) {
      matModalFileName.textContent = files[0].name;
      if (matModalTitleInput) {
        matModalTitleInput.disabled = false;
        matModalTitleInput.placeholder = "Ej: Manual de discipulado";
      }
    } else {
      matModalFileName.textContent = `${count} archivos seleccionados`;
      if (matModalTitleInput) {
        matModalTitleInput.value = "";
        matModalTitleInput.disabled = true;
        matModalTitleInput.placeholder = "Con varios archivos, cada uno usa su propio nombre";
      }
    }
  }

  matModalFileInput?.addEventListener("change", updateMatModalFileLabel);

  // Drag & drop sobre el mismo botón de seleccionar archivo (alternativa a
  // buscarlo manualmente). Arma un FileList nuevo con DataTransfer y lo
  // asigna al <input type="file"> real, así el resto del flujo (incluido
  // el submit) no tiene que distinguir entre selección manual y arrastrada.
  ["dragenter", "dragover"].forEach((evt) => {
    matModalFilePickBtn?.addEventListener(evt, (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      matModalFilePickBtn.classList.add("is-dragover");
    });
  });
  ["dragleave", "dragend"].forEach((evt) => {
    matModalFilePickBtn?.addEventListener(evt, (ev) => {
      ev.preventDefault();
      matModalFilePickBtn.classList.remove("is-dragover");
    });
  });
  matModalFilePickBtn?.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    matModalFilePickBtn.classList.remove("is-dragover");
    const dropped = ev.dataTransfer?.files;
    if (!dropped || !dropped.length || !matModalFileInput) return;
    const dt = new DataTransfer();
    Array.from(dropped).forEach((f) => dt.items.add(f));
    matModalFileInput.files = dt.files;
    updateMatModalFileLabel();
  });

  matModalFolderPickBtn?.addEventListener("click", () => {
    openMatFolderPicker({
      initialFolderId: matFileModalState.folderId,
      onConfirm: (folderId) => {
        matFileModalState.folderId = folderId;
        if (matModalFolderName) matModalFolderName.textContent = folderLabelFor(folderId);
      },
    });
  });

  function setMatFileModalSaveLoading(isLoading) {
    if (!matFileModalSaveBtn) return;
    matFileModalSaveBtn.disabled = isLoading;
    matFileModalSaveBtn.textContent = isLoading ? "Procesando…" : "Subir";
  }

  matFileModalSaveBtn?.addEventListener("click", async () => {
    if (matBusy) return;

    const titleInput = (matModalTitleInput?.value || "").trim();
    const linkUrl = (matModalLinkUrl?.value || "").trim();
    const files = matModalFileInput?.files ? Array.from(matModalFileInput.files) : [];
    const targetFolderId = matFileModalState.folderId || null;

    if (!files.length && !linkUrl) {
      setMatFileModalMsg("Selecciona uno o más archivos, o ingresa un enlace.", true);
      return;
    }
    if (files.length > 1 && linkUrl) {
      setMatFileModalMsg("No podés combinar varios archivos con un enlace. Subí el enlace por separado.", true);
      return;
    }

    matBusy = true;
    setMatFileModalSaveLoading(true);

    try {
      // Caso: solo enlace, sin archivo — igual que antes.
      if (!files.length) {
        setMatFileModalMsg("Guardando enlace…", false);
        const { error: insErr } = await supabase
          .from("materials")
          .insert({
            title: titleInput || null,
            image_url: null,
            file_name: null,
            link_url: linkUrl || null,
            folder_id: targetFolderId || null,
          });

        if (insErr) { setMatFileModalMsg(insErr.message, true); return; }

        closeMatFileModal();
        setMatMsg("Material publicado.", false);
        await loadMaterials();
        return;
      }

      // Caso: uno o más archivos (el enlace, si hay, solo aplica cuando es 1 solo archivo).
      let uploaded = 0;
      for (const file of files) {
        setMatFileModalMsg(
          files.length > 1 ? `Subiendo ${uploaded + 1} de ${files.length}…` : "Subiendo archivo…",
          false
        );

        const ext = (file.name || "").split(".").pop() || "bin";
        const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "bin";
        const filePath = `mat_${Date.now()}_${Math.random().toString(16).slice(2)}.${safeExt}`;

        const { error: upErr } = await supabase
          .storage
          .from("materials")
          .upload(filePath, file, { upsert: false, contentType: file.type || undefined });

        if (upErr) {
          setMatFileModalMsg(`Error subiendo "${file.name}": ${upErr.message}${uploaded ? ` (ya se publicaron ${uploaded})` : ""}`, true);
          return;
        }

        const url = await getPublicOrSignedUrl("materials", filePath);
        if (!url) {
          setMatFileModalMsg(`No se pudo obtener URL de "${file.name}" en Storage.${uploaded ? ` (ya se publicaron ${uploaded})` : ""}`, true);
          return;
        }

        // Con 1 solo archivo: usa el título escrito (si hay) o el nombre del
        // archivo. Con varios: siempre el nombre del archivo (el campo
        // Título queda deshabilitado en ese caso, ver updateMatModalFileLabel).
        const fallbackTitle = (file.name || "").replace(/\.[^.]+$/, "") || file.name;
        const rowTitle = (files.length === 1 && titleInput) ? titleInput : fallbackTitle;

        const { error: insErr } = await supabase
          .from("materials")
          .insert({
            title: rowTitle || null,
            image_url: url,
            file_name: file.name || null,
            link_url: files.length === 1 ? (linkUrl || null) : null,
            folder_id: targetFolderId || null,
          });

        if (insErr) {
          setMatFileModalMsg(`Error guardando "${file.name}": ${insErr.message}${uploaded ? ` (ya se publicaron ${uploaded})` : ""}`, true);
          return;
        }

        uploaded++;
      }

      closeMatFileModal();
      setMatMsg(uploaded > 1 ? `${uploaded} materiales publicados.` : "Material publicado.", false);
      await loadMaterials();
    } finally {
      setMatFileModalSaveLoading(false);
      matBusy = false;
    }
  });

  // -----------------------------
  // Popup: nueva Carpeta
  // -----------------------------
  const matFolderModal = document.getElementById("matFolderModal");
  const matModalFolderNameInput = document.getElementById("matModalFolderNameInput");
  const matModalLocationPickBtn = document.getElementById("matModalLocationPickBtn");
  const matModalLocationName = document.getElementById("matModalLocationName");
  const matFolderModalCancelBtn = document.getElementById("matFolderModalCancel");
  const matFolderModalSaveBtn = document.getElementById("matFolderModalSave");

  const matFolderModalState = { locationId: null };

  function setMatFolderModalMsg(text, isError) {
    setMsg("matFolderModalMsg", text, !!isError);
  }

  function openMatFolderModal() {
    if (matModalFolderNameInput) matModalFolderNameInput.value = "";
    matFolderModalState.locationId = matState.currentFolderId || null;
    if (matModalLocationName) matModalLocationName.textContent = folderLabelFor(matFolderModalState.locationId);
    setMatFolderModalMsg("", false);
    matFolderModal?.classList.remove("is-hidden");
  }
  function closeMatFolderModal() {
    matFolderModal?.classList.add("is-hidden");
  }

  document.getElementById("matBtnOpenFolderModal")?.addEventListener("click", openMatFolderModal);
  matFolderModalCancelBtn?.addEventListener("click", closeMatFolderModal);
  matFolderModal?.addEventListener("click", (ev) => {
    if (ev.target === matFolderModal) closeMatFolderModal();
  });

  matModalLocationPickBtn?.addEventListener("click", () => {
    openMatFolderPicker({
      initialFolderId: matFolderModalState.locationId,
      onConfirm: (folderId) => {
        matFolderModalState.locationId = folderId;
        if (matModalLocationName) matModalLocationName.textContent = folderLabelFor(folderId);
      },
    });
  });

  matFolderModalSaveBtn?.addEventListener("click", async () => {
    if (matBusy) return;
    const name = (matModalFolderNameInput?.value || "").trim();
    if (!name) { setMatFolderModalMsg("Escribe un nombre de carpeta.", true); return; }
    const parentId = matFolderModalState.locationId || null;

    matBusy = true;
    matFolderModalSaveBtn.disabled = true;
    matFolderModalSaveBtn.textContent = "Procesando…";

    try {
      const { error } = await supabase
        .from("material_folders")
        .insert({ name, parent_id: parentId || null, created_by: user.id });

      if (error) { setMatFolderModalMsg(error.message, true); return; }

      closeMatFolderModal();
      setMatMsg("Carpeta creada.", false);
      await loadMaterials();
    } finally {
      matFolderModalSaveBtn.disabled = false;
      matFolderModalSaveBtn.textContent = "Crear";
      matBusy = false;
    }
  });

  // -----------------------------
  // Contenido: breadcrumb + lista unificada (carpetas + materiales)
  // -----------------------------
  function renderMatBreadcrumb() {
    if (!matEls.breadcrumb) return;
    const path = getMatFolderPath(matState.currentFolderId);
    let html = `<button type="button" class="secondary users-action-btn" data-mat-crumb="">Principal</button>`;
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
    const itemsHere = rows
      .filter(r => (r.folder_id || null) === (matState.currentFolderId || null))
      .sort((a, b) => {
        const ta = matSortTypeLabel(a), tb = matSortTypeLabel(b);
        if (ta !== tb) return ta.localeCompare(tb);
        return (a.title || "").localeCompare(b.title || "", "es", { numeric: true, sensitivity: "base" });
      });

    if (!folders.length && !itemsHere.length) {
      matEls.list.innerHTML = '<div class="muted">No hay materiales en esta carpeta.</div>';
      return;
    }

    // Carpetas y subcarpetas: ver (abrir) / mover / eliminar.
    // "Descargar" no aplica a una carpeta (Storage no arma un zip de su contenido).
    const folderCards = folders.map(f => {
      const id = escapeHtml(f.id);
      const descendantIds = getMatFolderDescendantIds(f.id);
      return `
      <div class="mat-row" data-mat-folder-row="${id}">
        <div class="mat-row__name" data-mat-open-folder="${id}" style="cursor:pointer;">
          <i class="fa-solid fa-folder" style="font-size:16px;color:var(--accent2);flex-shrink:0;"></i>
          <div style="min-width:0;">
            <div class="mat-row__title">${escapeHtml(f.name)}</div>
          </div>
        </div>
        <div class="mat-row__actions">
          <button type="button" class="mat-icon-btn" data-mat-open-folder="${id}" title="Abrir" aria-label="Abrir"><i class="fa-solid fa-eye"></i></button>
          <button type="button" class="mat-icon-btn" data-mat-folder-toggle-move data-id="${id}" title="Mover" aria-label="Mover"><i class="fa-solid fa-up-down-left-right"></i></button>
          <select class="mat-move-select is-hidden" data-mat-folder-move-select data-id="${id}" title="Carpeta destino">${buildFolderOptionsHtml(f.parent_id || "", descendantIds)}</select>
          <button type="button" class="mat-icon-btn" data-mat-folder-action="rename" data-id="${id}" title="Renombrar" aria-label="Renombrar"><i class="fa-solid fa-pen-to-square"></i></button>
          <button type="button" class="mat-icon-btn" data-mat-folder-action="delete" data-id="${id}" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join("");

    const itemCards = itemsHere.map(r => {
      const title = escapeHtml(r.title || "(Sin título)");
      const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      const url = r.image_url || "";
      const safeUrl = escapeHtml(url);
      const fileName = (r.file_name || "") || "";
      const id = r.id;
      const hasFile = matHasFile(r);
      const link = matEffectiveLink(r);
      const safeLink = escapeHtml(link);

      const iconClass = hasFile ? (MAT_TYPE_ICON[inferMatType(r)] || MAT_TYPE_ICON.image) : inferLinkIcon(link);

      const viewBtn = hasFile
        ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="mat-icon-btn" title="Ver" aria-label="Ver"><i class="fa-solid fa-eye"></i></a>`
        : (link ? `<a href="${safeLink}" target="_blank" rel="noopener" class="mat-icon-btn" title="Ver" aria-label="Ver"><i class="fa-solid fa-eye"></i></a>` : "");

      const downloadBtn = hasFile
        ? `<a href="${safeUrl}" download class="mat-icon-btn" title="Descargar" aria-label="Descargar"><i class="fa-solid fa-cloud-arrow-down"></i></a>`
        : "";

      // Chip del enlace: solo aparece aparte cuando el material tiene archivo Y enlace a la vez.
      const linkChip = (hasFile && link)
        ? `<a href="${safeLink}" target="_blank" rel="noopener" class="mat-link-chip" title="Abrir enlace" aria-label="Abrir enlace"><i class="${inferLinkIcon(link)}"></i></a>`
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
            ${linkChip}
            ${viewBtn}
            ${downloadBtn}
            <button type="button" class="mat-icon-btn" data-mat-toggle-move data-id="${escapeHtml(id)}" title="Mover" aria-label="Mover"><i class="fa-solid fa-up-down-left-right"></i></button>
            <select class="mat-move-select is-hidden" data-mat-move-select data-id="${escapeHtml(id)}" title="Carpeta destino">${buildFolderOptionsHtml(r.folder_id || "")}</select>
            <button type="button" class="mat-icon-btn" data-mat-action="rename" data-id="${escapeHtml(id)}" title="Renombrar" aria-label="Renombrar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button type="button" class="mat-icon-btn" data-mat-action="delete" data-id="${escapeHtml(id)}" title="Eliminar" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join("");

    matEls.list.innerHTML = folderCards + itemCards;
  }

  // Abrir carpeta (click en la fila o en el ícono "ver" de una carpeta)
  matEls.list?.addEventListener("click", (ev) => {
    if (ev.target?.closest?.("select") || ev.target?.closest?.("[data-mat-toggle-move], [data-mat-folder-toggle-move]")) return;
    const openTarget = ev.target?.closest?.("[data-mat-open-folder]");
    if (!openTarget) return;
    matState.currentFolderId = openTarget.getAttribute("data-mat-open-folder");
    renderMatBreadcrumb();
    renderMatList();
  });

  // Mover MATERIAL: abre/cierra el dropdown (uno visible a la vez)
  matEls.list?.addEventListener("click", (ev) => {
    const toggleBtn = ev.target?.closest?.("[data-mat-toggle-move]");
    if (!toggleBtn) return;
    const id = toggleBtn.getAttribute("data-id");
    const select = matEls.list.querySelector(`select[data-mat-move-select][data-id="${CSS.escape(id)}"]`);
    if (!select) return;

    const wasHidden = select.classList.contains("is-hidden");
    matEls.list.querySelectorAll("select[data-mat-move-select], select[data-mat-folder-move-select]")
      .forEach(s => s.classList.add("is-hidden"));

    if (wasHidden) {
      select.classList.remove("is-hidden");
      select.focus();
      try { select.click(); } catch {}
    }
  });

  // Mover CARPETA: abre/cierra el dropdown (uno visible a la vez)
  matEls.list?.addEventListener("click", (ev) => {
    const toggleBtn = ev.target?.closest?.("[data-mat-folder-toggle-move]");
    if (!toggleBtn) return;
    const id = toggleBtn.getAttribute("data-id");
    const select = matEls.list.querySelector(`select[data-mat-folder-move-select][data-id="${CSS.escape(id)}"]`);
    if (!select) return;

    const wasHidden = select.classList.contains("is-hidden");
    matEls.list.querySelectorAll("select[data-mat-move-select], select[data-mat-folder-move-select]")
      .forEach(s => s.classList.add("is-hidden"));

    if (wasHidden) {
      select.classList.remove("is-hidden");
      select.focus();
      try { select.click(); } catch {}
    }
  });

  // Cierra cualquier dropdown de "mover" abierto al hacer click fuera de él
  document.addEventListener("click", (ev) => {
    if (ev.target.closest?.("[data-mat-toggle-move]") || ev.target.closest?.("[data-mat-folder-toggle-move]")
      || ev.target.closest?.("select[data-mat-move-select]") || ev.target.closest?.("select[data-mat-folder-move-select]")) return;
    matEls.list?.querySelectorAll("select[data-mat-move-select], select[data-mat-folder-move-select]")
      .forEach(s => s.classList.add("is-hidden"));
  });

  // Al elegir carpeta destino para un MATERIAL, se mueve de inmediato
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

      if (error) { setMatMsg(error.message, true); return; }

      setMatMsg("Material movido.", false);
      await loadMaterials();
    } finally {
      matBusy = false;
    }
  });

  // Al elegir carpeta destino para una CARPETA, se mueve de inmediato
  // (reasigna su parent_id; ya excluye su propio subárbol en las opciones).
  matEls.list?.addEventListener("change", async (ev) => {
    const select = ev.target?.closest?.("select[data-mat-folder-move-select]");
    if (!select) return;
    const id = select.getAttribute("data-id");
    const targetFolderId = select.value || null;
    if (!id) return;

    if (matBusy) return;
    matBusy = true;
    select.disabled = true;

    try {
      const { error } = await supabase
        .from("material_folders")
        .update({ parent_id: targetFolderId })
        .eq("id", id);

      if (error) { setMatMsg(error.message, true); return; }

      setMatMsg("Carpeta movida.", false);
      await loadMaterials();
    } finally {
      matBusy = false;
    }
  });

  // Renombrar / Eliminar CARPETA (desde Contenido)
  matEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button[data-mat-folder-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-mat-folder-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;
    const folder = getMatFolderById(id);
    if (!folder) return;

    if (action === "rename") {
      if (matBusy) return;
      const newName = await showMatPrompt({
        title: "Renombrar carpeta",
        initialValue: folder.name || "",
        confirmLabel: "Guardar",
      });
      if (!newName || newName === folder.name) return;

      matBusy = true;
      btn.disabled = true;
      try {
        const { error } = await supabase
          .from("material_folders")
          .update({ name: newName })
          .eq("id", id);

        if (error) { setMatMsg(error.message, true); return; }

        setMatMsg("Carpeta renombrada.", false);
        await loadMaterials();
      } finally {
        btn.disabled = false;
        matBusy = false;
      }
      return;
    }

    if (action !== "delete") return;

    if (matBusy) return;
    const ok = await showMatConfirm({
      title: "Eliminar carpeta",
      body: `¿Eliminar la carpeta "${folder.name}"? Las subcarpetas también se eliminarán. Los materiales dentro no se borran: quedarán en la carpeta raíz.`,
      confirmLabel: "Eliminar",
    });
    if (!ok) return;

    matBusy = true;
    btn.disabled = true;

    try {
      const { error } = await supabase
        .from("material_folders")
        .delete()
        .eq("id", id);

      if (error) { setMatMsg(error.message, true); return; }

      setMatMsg("Carpeta eliminada.", false);
      await loadMaterials();
    } finally {
      btn.disabled = false;
      matBusy = false;
    }
  });

  // Renombrar / Eliminar MATERIAL (desde Contenido)
  matEls.list?.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("button[data-mat-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-mat-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;

    if (action === "rename") {
      if (matBusy) return;
      const row = matRows.find(r => r.id === id);
      if (!row) return;

      const newTitle = await showMatPrompt({
        title: "Renombrar material",
        initialValue: row.title || "",
        confirmLabel: "Guardar",
      });
      if (!newTitle || newTitle === row.title) return;

      matBusy = true;
      btn.disabled = true;
      try {
        const { error } = await supabase
          .from("materials")
          .update({ title: newTitle })
          .eq("id", id);

        if (error) { setMatMsg(error.message, true); return; }

        setMatMsg("Material renombrado.", false);
        await loadMaterials();
      } finally {
        btn.disabled = false;
        matBusy = false;
      }
      return;
    }

    if (action !== "delete") return;

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
      const row = matRows.find(r => r.id === id);

      const { error } = await supabase
        .from("materials")
        .delete()
        .eq("id", id);

      if (error) { setMatMsg(error.message, true); return; }

      if (row?.image_url) await tryDeleteStorageObject("materials", row.image_url);

      setMatMsg("Material eliminado.", false);
      await loadMaterials();
    } finally {
      btn.disabled = false;
      matBusy = false;
    }
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
          .select("id, title, image_url, file_name, link_url, created_at, folder_id")
          .order("created_at", { ascending: false }),
      ]);

      // Carpetas y materiales se procesan por separado: un error en una
      // consulta no debe ocultar los resultados válidos de la otra
      // (p. ej. si falta una columna nueva en `materials`, las carpetas
      // igual deben verse).
      matFoldersCache = foldersRes.error ? [] : (Array.isArray(foldersRes.data) ? foldersRes.data : []);
      matRows = materialsRes.error ? [] : (Array.isArray(materialsRes.data) ? materialsRes.data : []);

      ensureValidMatFolder();
      renderMatBreadcrumb();
      renderMatList();

      if (foldersRes.error) {
        setMatMsg(foldersRes.error.message, true);
      } else if (materialsRes.error) {
        setMatMsg(materialsRes.error.message, true);
      } else {
        setMatMsg("", false);
      }
    } finally {
      matBusy = false;
    }
  }


  // -----------------------------
  // Administrar Usuarios
  // -----------------------------
  const ROLE_LABELS = {
    user: "Lider_de_Célula",
    leader: "Lider_de_Escuadron",
    pastor: "Pastor",
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
        btnToggle.className = "mat-icon-btn";
        const toggleLabel = u.active ? "Suspender" : "Activar";
        btnToggle.title = toggleLabel;
        btnToggle.setAttribute("aria-label", toggleLabel);
        btnToggle.innerHTML = u.active
          ? '<i class="fa-solid fa-lock"></i>'
          : '<i class="fa-solid fa-lock-open"></i>';
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
      btnReset.className = "mat-icon-btn";
      btnReset.title = "Reset passw";
      btnReset.setAttribute("aria-label", "Reset passw");
      btnReset.innerHTML = '<i class="fa-solid fa-key"></i>';
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

      const btnRename = document.createElement("button");
      btnRename.type = "button";
      btnRename.className = "mat-icon-btn";
      btnRename.title = "Editar nombre";
      btnRename.setAttribute("aria-label", "Editar nombre");
      btnRename.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
      btnRename.addEventListener("click", async () => {
        if (usersBusy) return;
        const newName = await showMatPrompt({
          title: "Editar nombre",
          initialValue: u.full_name || "",
          confirmLabel: "Guardar",
        });
        if (!newName || newName === u.full_name) return;

        usersBusy = true;
        btnRename.disabled = true;
        const { data, error } = await callManageUsersEdge(supabase, {
          action: "update",
          user_id: u.id,
          full_name: newName,
        });
        usersBusy = false;
        btnRename.disabled = false;

        if (error || !data?.ok) {
          setMsg("usersMsg", (data && data.error) || "No se pudo actualizar el nombre.", true);
          return;
        }
        setMsg("usersMsg", "Nombre actualizado.", false);
        await loadAllUsers();
      });
      tdActions.appendChild(btnRename);

      if (!isSelf) {
        const btnDelete = document.createElement("button");
        btnDelete.type = "button";
        btnDelete.className = "mat-icon-btn users-action-btn--danger";
        btnDelete.title = "Eliminar";
        btnDelete.setAttribute("aria-label", "Eliminar");
        btnDelete.innerHTML = '<i class="fa-solid fa-trash"></i>';
        btnDelete.addEventListener("click", async () => {
          if (usersBusy) return;
          const ok = await showMatConfirm({
            title: "Eliminar usuario definitivamente",
            body: `¿Eliminar a "${u.full_name || u.email}" (${ROLE_LABELS[u.role] || u.role}) para siempre? Esto borra su cuenta, sus notas propias y su historial de revisión. Esta acción NO se puede deshacer. Si solo querés desactivarlo temporalmente, usá "Block" en vez de esto.`,
            confirmLabel: "Eliminar definitivamente",
          });
          if (!ok) return;

          usersBusy = true;
          btnDelete.disabled = true;
          const { data, error } = await callManageUsersEdge(supabase, {
            action: "delete",
            user_id: u.id,
          });
          usersBusy = false;
          btnDelete.disabled = false;

          if (error || !data?.ok) {
            setMsg("usersMsg", (data && data.error) || "No se pudo eliminar el usuario.", true);
            return;
          }
          setMsg("usersMsg", "Usuario eliminado.", false);
          await loadAllUsers();
        });
        tdActions.appendChild(btnDelete);
      }

      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  function setUsersTabActive(id) {
    ["usersTabAdmin", "usersTabPastor", "usersTabLeader", "usersTabUser"].forEach((tid) => {
      document.getElementById(tid)?.classList.toggle("active", tid === id);
    });
  }

  document.getElementById("usersTabAdmin")?.addEventListener("click", () => {
    setUsersTabActive("usersTabAdmin");
    renderUsersTable("admin");
  });
  document.getElementById("usersTabPastor")?.addEventListener("click", () => {
    setUsersTabActive("usersTabPastor");
    renderUsersTable("pastor");
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
