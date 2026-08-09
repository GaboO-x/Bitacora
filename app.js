import { requireSession, getMyProfile } from "./shared.js";

(async () => {
  const { supabase, session } = await requireSession();
  if (!supabase || !session) {
    window.location.href = "./index.html";
    return;
  }

  let cachedProfile = null;

  const user = session.user;

  // Logout real (con confirmación)
  const doLogout = async () => {
    const ok = confirm('Seguro que deseas salir?');
    if (!ok) return;
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = "./index.html";
  };

  const btnLogoutTop = document.querySelector('#btnLogout');
  btnLogoutTop?.addEventListener('click', doLogout);

  const btnLogoutSide = document.querySelector('#btnLogoutSide');
  btnLogoutSide?.addEventListener('click', doLogout);

  // Boton Atras
const btnBack = document.querySelector('#btnBack');
btnBack?.addEventListener('click', () => {
  goBack();
});

  // --- UI original (sin cambios de comportamiento visual / navegación)
  (() => {
    const qs = (sel, el=document) => el.querySelector(sel);
    const qsa = (sel, el=document) => Array.from(el.querySelectorAll(sel));

    const state = {
      view: 'home',
      selectedWeek: null,
      dcOpen: false,
      dcDirty: false,
      dcRowCount: 2,
      history: [],
      notesOpenSheet: null,
      takersDirty: false,
      cultosDirty: false,
      lideresDirty: false,
    };

    // ---- Sidebar toggle (móvil / escritorio)
    const shell = qs('#appShell');
    const btnToggleSidebar = qs('#btnToggleSidebar');
    const isMobile = () => window.matchMedia('(max-width: 920px)').matches;

    const toggleSidebar = () => {
      if (isMobile()) {
        shell.classList.toggle('is-sidebar-open');
      } else {
        shell.classList.toggle('is-sidebar-collapsed');
      }
    };

    btnToggleSidebar?.addEventListener('click', toggleSidebar);

    // Limpia estado al cambiar de tamaño
    window.addEventListener('resize', () => {
      if (!isMobile()) shell.classList.remove('is-sidebar-open');
    });

    // Cerrar sidebar al cambiar de vista en móvil
    const closeSidebarOnMobile = () => {
      if (window.matchMedia('(max-width: 920px)').matches) {
        shell.classList.remove('is-sidebar-open');
      }
    };

    // ---- Navegación por vistas
    const setActiveNav = (view) => {
      qsa('.nav-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.view === view);
      });
    };

    // Etiquetas (completa/abreviada) de cada hoja de Notas para el subtítulo junto al <h1>
    const NOTE_SHEET_CRUMB = {
      dc:      { full: 'Célula',                             compact: 'Célula' },
      takers:  { full: 'Takers',                              compact: 'Takers' },
      cultos:  { full: 'Cultos',                              compact: 'Cultos' },
      lideres: { full: 'Reunión de Líderes/Ministerios',      compact: 'Reu Lid/Min' },
    };

    // Arma " | Semana X" (full) / " | Sem X" (compact), y agrega la hoja abierta si aplica.
    // Se muestra junto al <h1>Notas</h1>, no en la barra superior.
    const updateNotesCrumb = () => {
      const tailFull = qs('#notesTailFull');
      const tailCompact = qs('#notesTailCompact');
      if (!tailFull || !tailCompact) return;

      if (!state.selectedWeek) { tailFull.textContent = ''; tailCompact.textContent = ''; return; }

      const weekPart = { full: `Semana ${state.selectedWeek}`, compact: `Sem ${state.selectedWeek}` };
      const sheet = state.notesOpenSheet ? NOTE_SHEET_CRUMB[state.notesOpenSheet] : null;

      const fullParts = [weekPart.full];
      const compactParts = [weekPart.compact];
      if (sheet) { fullParts.push(sheet.full); compactParts.push(sheet.compact); }

      tailFull.textContent = ' | ' + fullParts.join(' | ');
      tailCompact.textContent = ' | ' + compactParts.join(' | ');
    };

    // Muestra/oculta el trío de botones Atrás/Guardar/Compartir (junto al tail del <h1>Notas</h1>)
    // según el estado actual: ocultos en el selector de semanas, solo Atrás en pantalla de semana,
    // Atrás+Guardar en Dinámica Celular (sin Compartir), Atrás+Guardar+Compartir en Takers/Cultos/Líderes.
    const NOTES_SHEETS_WITH_SHARE = ['takers', 'cultos', 'lideres'];

    // ¿La hoja actualmente abierta tiene cambios sin guardar?
    const isCurrentSheetDirty = () => {
      switch (state.notesOpenSheet) {
        case 'dc': return !!state.dcDirty;
        case 'takers': return !!state.takersDirty;
        case 'cultos': return !!state.cultosDirty;
        case 'lideres': return !!state.lideresDirty;
        default: return false;
      }
    };

    // Color del botón Guardar: gris (hay cambios sin guardar) / verde (todo guardado)
    const updateSaveButtonState = () => {
      if (!notesBtnSave) return;
      const allSaved = !!state.notesOpenSheet && !isCurrentSheetDirty();
      notesBtnSave.classList.toggle('is-saved', allSaved);
    };

    const updateNotesHeaderActions = () => {
      if (!notesHeaderActions) return;
      const showBack = !!state.selectedWeek;
      notesHeaderActions.classList.toggle('is-hidden', !showBack);
      if (notesBtnShare) {
        const showShare = NOTES_SHEETS_WITH_SHARE.includes(state.notesOpenSheet);
        notesBtnShare.classList.toggle('is-hidden', !showShare);
      }
      if (notesBtnSave) {
        notesBtnSave.classList.toggle('is-hidden', !state.notesOpenSheet);
      }
      updateSaveButtonState();
    };

    // Modal "Cambios sin guardar": Promise<'save'|'discard'>
    let notesLeaveResolve = null;
    const openNotesLeaveModal = () => new Promise((resolve) => {
      notesLeaveResolve = resolve;
      notesLeaveModal?.classList.remove('is-hidden');
    });
    const closeNotesLeaveModal = (result) => {
      notesLeaveModal?.classList.add('is-hidden');
      if (notesLeaveResolve) { notesLeaveResolve(result); notesLeaveResolve = null; }
    };

    const showView = (view) => {
      state.view = view;
      qsa('.view').forEach(v => v.classList.remove('is-visible'));
      const section = qs(`#view-${view}`);
      section?.classList.add('is-visible');

      setActiveNav(view);
      if (view === 'notas') { updateNotesCrumb(); updateNotesHeaderActions(); }
      closeSidebarOnMobile();

      if (view === 'calendario') {
        // Carga/refresh del calendario al entrar en la vista
        loadCalendar();
      }

      if (view === 'anuncios') {
        loadAnnouncements();
      }

      if (view === 'material') {
        loadMaterials();
      }

      if (view === 'revision') {
        initReviewView();
      }
    };

    const NOTES_DRAFT_KEY = 'bitacora_notes_drafts_v1';

    const readDrafts = () => {
      try { return JSON.parse(localStorage.getItem(NOTES_DRAFT_KEY) || '{}'); }
      catch { return {}; }
    };

    const writeDrafts = (obj) => {
      try { localStorage.setItem(NOTES_DRAFT_KEY, JSON.stringify(obj)); } catch {}
    };

    const getWeekDraft = (week) => {
      const all = readDrafts();
      return all[String(week)] || {};
    };

    const setWeekDraft = (week, patch) => {
      const all = readDrafts();
      const k = String(week);
      all[k] = { ...(all[k] || {}), ...(patch || {}) };
      writeDrafts(all);
    };

    const setStatus = (statusEl, msg) => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
    };

    const nowLabel = () => {
      try { return new Date().toLocaleString(); } catch { return ''; }
    };

    const collectDcDraft = () => {
      if (!notesSheetScreen) return null;
      const blocks = qsa('.dc-item', notesSheetScreen).map(item => {
        const inputs = qsa('input', item);
        const t = inputs[0].value || '';
        const r = inputs[1].value || '';
        return { t, r };
      });

      const follow = qsa('tr', dcFollowBody || document).map(tr => {
        const name = qs('td:nth-child(1) input', tr)?.value || '';
        const enc = qs('td:nth-child(2) input', tr)?.value || '';
        const yes = qs('input[type="radio"][value="si"]', tr);
        const no = qs('input[type="radio"][value="no"]', tr);
        const just = (yes && yes.checked) ? 'si' : ((no && no.checked) ? 'no' : '');
        const date = qs('td:nth-child(4) input[type="date"]', tr)?.value || '';
        return { name, enc, just, date };
      });

      return {
        date: dcDate?.value || '',
        blocks,
        follow,
        notes: dcNotes?.value || '',
      };
    };

    const applyDcDraft = (draft) => {
      if (!draft || !notesSheetScreen) return;
      if (dcDate && draft.date) dcDate.value = draft.date;
      if (dcNotes && typeof draft.notes === 'string') dcNotes.value = draft.notes;

      const items = qsa('.dc-item', notesSheetScreen);
      (draft.blocks || []).forEach((b, i) => {
        const item = items[i];
        if (!item) return;
        const inputs = qsa('input', item);
        if (inputs[0] && b.t != null) inputs[0].value = b.t;
        if (inputs[1] && b.r != null) inputs[1].value = b.r;
      });

      if (dcFollowBody && Array.isArray(draft.follow)) {
        const rows = qsa('tr', dcFollowBody);
        draft.follow.forEach((row, i) => {
          const tr = rows[i];
          if (!tr) return;
          const name = qs('td:nth-child(1) input', tr);
          const enc = qs('td:nth-child(2) input', tr);
          const yes = qs('input[type="radio"][value="si"]', tr);
          const no = qs('input[type="radio"][value="no"]', tr);
          const date = qs('td:nth-child(4) input[type="date"]', tr);
          if (name && row.name != null) name.value = row.name;
          if (enc && row.enc != null) enc.value = row.enc;
          if (yes && no) {
            yes.checked = row.just == 'si';
            no.checked = row.just == 'no';
          }
          if (date && row.date != null) date.value = row.date;
        });
      }
    };

    const collectRteDraft = (temaEl, dateEl, editorEl) => ({
      tema: temaEl?.value || '',
      date: dateEl?.value || '',
      html: editorEl?.innerHTML || '',
    });

    const applyRteDraft = (draft, temaEl, dateEl, editorEl) => {
      if (!draft) return;
      if (temaEl && draft.tema != null) temaEl.value = draft.tema;
      if (dateEl && draft.date != null) dateEl.value = draft.date;
      if (editorEl && typeof draft.html === 'string' && draft.html.length) editorEl.innerHTML = draft.html;
    };

    // Guardado manual (botón "Guardar"): fuerza el guardado de la hoja abierta,
    // sin depender del flag "dirty". Misma persistencia local (localStorage) de siempre.
    const saveNotesNow = () => {
      if (!state.selectedWeek || !state.notesOpenSheet) return;

      if (state.notesOpenSheet === 'dc') {
        const d = collectDcDraft();
        if (d) setWeekDraft(state.selectedWeek, { dc: d });
        state.dcDirty = false;
        setStatus(dcStatus, `Guardado: ${nowLabel()} (local)`);
      } else if (state.notesOpenSheet === 'takers') {
        setWeekDraft(state.selectedWeek, { takers: collectRteDraft(takersTema, takersDate, takersNotes) });
        state.takersDirty = false;
        setStatus(takersStatus, `Guardado: ${nowLabel()} (local)`);
      } else if (state.notesOpenSheet === 'cultos') {
        setWeekDraft(state.selectedWeek, { cultos: collectRteDraft(cultosTema, cultosDate, cultosNotes) });
        state.cultosDirty = false;
        setStatus(cultosStatus, `Guardado: ${nowLabel()} (local)`);
      } else if (state.notesOpenSheet === 'lideres') {
        setWeekDraft(state.selectedWeek, { lideres: collectRteDraft(lideresTema, lideresDate, lideresNotes) });
        state.lideresDirty = false;
        setStatus(lideresStatus, `Guardado: ${nowLabel()} (local)`);
      }
      updateSaveButtonState();
    };

    // Antes de salir de una hoja de Notas: si hay cambios sin guardar, pregunta con el modal
    // (Salir sin guardar / Guardar). Si no hay cambios, continúa sin interrumpir.
    // Devuelve true si es seguro continuar con la salida, false si el usuario se quedó.
    const confirmLeaveNotesSheet = async () => {
      if (!isCurrentSheetDirty()) return true;
      const choice = await openNotesLeaveModal();
      if (choice === 'save') { saveNotesNow(); return true; }
      if (choice === 'discard') {
        // Descartar: no persistimos; la próxima vez que se abra la hoja se recarga
        // el último borrador guardado en localStorage (los cambios en pantalla se pierden).
        switch (state.notesOpenSheet) {
          case 'dc': state.dcDirty = false; break;
          case 'takers': state.takersDirty = false; break;
          case 'cultos': state.cultosDirty = false; break;
          case 'lideres': state.lideresDirty = false; break;
        }
        return true;
      }
      return false;
    };

    const navigate = async (view, opts = {}) => {
      if (!(await confirmLeaveNotesSheet())) return;
      const { push = true } = opts;
      if (push && state.view && state.view !== view) {
        state.history.push(state.view);
      }
      showView(view);
    };

    const goBack = async () => {
      if (!(await confirmLeaveNotesSheet())) return;
      const prev = state.history.pop();
      if (prev) showView(prev);
      else showView('home');
    };


    qsa('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.view));
    });
    // ---- Accesos directos (cards en Inicio)
    qsa('.card--action[data-view]').forEach(card => {
      card.addEventListener('click', () => navigate(card.dataset.view));
    });

    // ---- Botones globales dentro de cada sección
    document.addEventListener('click', (e) => {
      const goHome = e.target.closest('[data-go="home"]');
      if (goHome) {
        e.preventDefault();
        navigate('home');
        return;
      }
      const goBackBtn = e.target.closest('[data-go="back"]');
      if (goBackBtn) {
        e.preventDefault();
        goBack();
        return;
      }
    });


    // ---- Calendario (tabla tipo “Excel”) - Supabase calendar_activities
    const calendarContainer = qs('#calendarContainer');
    const calendarStatus = qs('#calendarStatus');
    const btnCalNew = qs('#btnCalNew');

    const normalizeProfile = (p) => {
      if (!p) return null;
      if (p.data && typeof p.data === 'object') return p.data;
      if (p.profile && typeof p.profile === 'object') return p.profile;
      return p;
    };

    // Role actual del usuario (según profiles). Importante: getMyProfile requiere userId.
    const getRole = async () => {
      if (!cachedProfile) {
        try {
          cachedProfile = normalizeProfile(await getMyProfile(supabase, user.id));
        } catch {
          cachedProfile = null;
        }
      }
      return (cachedProfile && cachedProfile.role) ? String(cachedProfile.role) : 'user';
    };

    const escapeHtml = (s) => {
      const str = (s == null) ? '' : String(s);
      return str
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    };


    // ---- Revisión de Notas (solo Leader)
    const navReviewNotes = qs('#navReviewNotes');
    const cardReviewNotes = qs('#cardReviewNotes');

    const reviewUserSelect = qs('#reviewUserSelect');
    const reviewUserStatus = qs('#reviewUserStatus');
    const reviewWeeksGrid = qs('#reviewWeeksGrid');
    const reviewWeekPicker = qs('#reviewWeekPicker');
    const reviewWeekScreen = qs('#reviewWeekScreen');
    const reviewWeekTitle = qs('#reviewWeekTitle');
    const btnReviewBackToWeeks = qs('#btnReviewBackToWeeks');
    const chkReviewWeekDone = qs('#chkReviewWeekDone');
    const chkWeekReviewed = qs('#chkWeekReviewed');
    const reviewMeta = qs('#reviewMeta');

    const btnReviewDinamica = qs('#btnReviewDinamica');
    const btnReviewTakers = qs('#btnReviewTakers');
    const btnReviewCultos = qs('#btnReviewCultos');
    const btnReviewLideres = qs('#btnReviewLideres');

    const reviewSheetScreen = qs('#reviewSheetScreen');
    const reviewSheetTitle = qs('#reviewSheetTitle');
    const btnReviewSheetBack = qs('#btnReviewSheetBack');
    const reviewSheetStatus = qs('#reviewSheetStatus');
    const reviewSheetContent = qs('#reviewSheetContent');

    const reviewComment = qs('#reviewComment');
    const btnAddReviewComment = qs('#btnAddReviewComment');
    const reviewCommentStatus = qs('#reviewCommentStatus');
    const reviewCommentsList = qs('#reviewCommentsList');

    const reviewState = {
      userId: null,
      userName: null,
      week: null,
      userWeeksDone: {},
      weeksReviewed: {},
      notesBySheet: { dc: null, takers: null, cultos: null, lideres: null },
      noteIdForFeedback: null,
    };

    const setReviewStatus = (msg) => setStatus(reviewUserStatus, msg);
    const setReviewMeta = (msg) => setStatus(reviewMeta, msg);
    const setReviewCommentStatus = (msg) => setStatus(reviewCommentStatus, msg);

    const populateReviewWeeks = () => {
      if (!reviewWeeksGrid) return;
      reviewWeeksGrid.innerHTML = '';
      for (let i=1; i<=52; i++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'week';
        b.textContent = `Sem ${i}`;
        b.title = `Semana ${i}: ${weekRangeLabel(i)}`;
        b.dataset.week = String(i);
        b.addEventListener('click', () => selectReviewWeek(i));
        reviewWeeksGrid.appendChild(b);
      }
    };

    const paintReviewWeekTiles = () => {
      if (!reviewWeeksGrid) return;
      qsa('.week', reviewWeeksGrid).forEach(w => {
        const n = Number(w.dataset.week);
        w.classList.toggle('is-done', !!reviewState.userWeeksDone[String(n)]);
        const reviewed = !!reviewState.weeksReviewed[String(n)];
        w.classList.toggle('is-selected', reviewState.week === n);
        w.classList.toggle('is-reviewed', reviewed);
      });
    };

    const resetReviewWeekUI = () => {
      reviewWeekScreen?.classList.add('is-hidden');
      reviewWeekPicker?.classList.remove('is-hidden');
      reviewSheetScreen?.classList.add('is-hidden');
      if (reviewSheetContent) reviewSheetContent.textContent = '';
      if (reviewSheetTitle) reviewSheetTitle.textContent = 'Hoja';
      if (reviewSheetStatus) reviewSheetStatus.textContent = '';
      if (chkReviewWeekDone) chkReviewWeekDone.checked = false;
      if (chkWeekReviewed) chkWeekReviewed.checked = false;
      if (reviewCommentsList) reviewCommentsList.textContent = 'Selecciona una semana para ver el historial.';
      setReviewCommentStatus('');
    };

    const loadLeaderSquadCodes = async () => {
      const res = await supabase
        .from('leader_squads')
        .select('squad_code')
        .eq('leader_id', user.id);
      if (res.error) return [];
      const codes = (res.data || []).map(r => r.squad_code).filter(Boolean);
      return Array.from(new Set(codes));
    };

    const loadUsersInSquads = async (codes) => {
      if (!codes || !codes.length) return [];
      const res = await supabase
        .from('user_squads')
        .select('user_id')
        .in('squad_code', codes);
      if (res.error) return [];
	      // Remove duplicates and ALWAYS exclude the current leader from the scope list.
	      return Array.from(new Set((res.data || []).map(r => r.user_id).filter(Boolean)))
	        .filter(id => id !== user.id);
    };

	    const loadProfilesByIds = async (ids) => {
	      if (!ids || !ids.length) return [];
	      // Enforce filtering at the query level to avoid any mismatch between
	      // auth user id and profile id, and to never show leaders/admins here.
	      const res = await supabase
	        .from('profiles')
	        .select('id, full_name')
	        .in('id', ids)
	        .eq('role', 'user')
	        .eq('active', true)
	        .neq('id', user.id)
	        .order('full_name', { ascending: true });
	      if (res.error) return [];
	      return (res.data || []).filter(Boolean);
	    };

    const loadReviewUsers = async () => {
      if (!reviewUserSelect) return;
      reviewUserSelect.innerHTML = '<option value="">Selecciona…</option>';
      setReviewStatus('Cargando usuarios…');

      const squadCodes = await loadLeaderSquadCodes();
      const userIds = await loadUsersInSquads(squadCodes);
      const users = await loadProfilesByIds(userIds);

      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.full_name || u.id;
        reviewUserSelect.appendChild(opt);
      });

      setReviewStatus(users.length ? '' : 'No tienes usuarios asignados.');
    };

    const loadUserWeekDoneMap = async (targetUserId) => {
      const res = await supabase
        .from('notes')
        .select('week, week_done')
        .eq('user_id', targetUserId)
        .eq('week_done', true);
      const map = {};
      if (!res.error) {
        (res.data || []).forEach(r => {
          if (r && r.week) map[String(r.week)] = true;
        });
      }
      return map;
    };

    const loadWeeksReviewedMap = async (targetUserId) => {
      const res = await supabase
        .from('note_reviews')
        .select('week, review_done')
        .eq('leader_id', user.id)
        .eq('user_id', targetUserId);
      const map = {};
      if (!res.error) {
        (res.data || []).forEach(r => {
          if (r && r.week != null) map[String(r.week)] = !!r.review_done;
        });
      }
      return map;
    };

    const onSelectReviewUser = async () => {
      if (!reviewUserSelect) return;
      const id = reviewUserSelect.value || '';
      reviewState.userId = id || null;
      reviewState.userName = id ? (reviewUserSelect.selectedOptions?.[0]?.textContent || null) : null;
      reviewState.week = null;
      resetReviewWeekUI();
      paintReviewWeekTiles();

      if (!id) {
        setReviewStatus('');
        return;
      }

      setReviewStatus('Cargando semanas…');
      reviewState.userWeeksDone = await loadUserWeekDoneMap(id);
      reviewState.weeksReviewed = await loadWeeksReviewedMap(id);
      paintReviewWeekTiles();
      setReviewStatus('');
    };

    const renderJson = (obj) => {
      try { return JSON.stringify(obj || {}, null, 2); }
      catch { return String(obj || ''); }
    };

    const showReviewSheet = (key, title) => {
      reviewSheetScreen?.classList.remove('is-hidden');
      if (reviewSheetTitle) reviewSheetTitle.textContent = title;
      const row = reviewState.notesBySheet[key];
      if (!row) {
        if (reviewSheetContent) reviewSheetContent.textContent = 'Sin notas para esta hoja.';
        return;
      }
      if (reviewSheetContent) reviewSheetContent.textContent = renderJson(row.data);
    };

    const loadReviewComments = async () => {
      if (!reviewCommentsList) return;
      if (!reviewState.noteIdForFeedback) {
        reviewCommentsList.textContent = 'No hay historial (no hay notas de esa semana).';
        return;
      }
      reviewCommentsList.textContent = 'Cargando…';
      const res = await supabase
        .from('note_feedback')
        .select('id, comment, created_at, reviewer_id')
        .eq('note_id', reviewState.noteIdForFeedback)
        .order('created_at', { ascending: false });
      if (res.error) {
        reviewCommentsList.textContent = 'No se pudo cargar el historial.';
        return;
      }
      const rows = res.data || [];
      if (!rows.length) {
        reviewCommentsList.textContent = 'Sin notas de revisión.';
        return;
      }
      reviewCommentsList.innerHTML = rows.map(r => {
        const d = r.created_at ? new Date(r.created_at).toLocaleString() : '';
        return `<div class="panel" style="padding:10px; margin:0 0 10px 0;">
          <div class="muted tiny">${escapeHtml(d)}</div>
          <div style="white-space:pre-wrap;">${escapeHtml(r.comment || '')}</div>
        </div>`;
      }).join('');
    };

    const selectReviewWeek = async (weekNum) => {
      if (!reviewState.userId) {
        setReviewStatus('Selecciona un usuario primero.');
        return;
      }
      reviewState.week = weekNum;
      paintReviewWeekTiles();

      reviewWeekPicker?.classList.add('is-hidden');
      reviewWeekScreen?.classList.remove('is-hidden');
      if (reviewWeekTitle) reviewWeekTitle.textContent = `Semana ${weekNum}`;
      if (chkReviewWeekDone) chkReviewWeekDone.checked = !!reviewState.userWeeksDone[String(weekNum)];
      if (chkWeekReviewed) chkWeekReviewed.checked = !!reviewState.weeksReviewed[String(weekNum)];
      setReviewMeta(`Usuario: ${reviewState.userName || ''} • Semana ${weekNum}`);

      // Cargar notas (si hay)
      const res = await supabase
        .from('notes')
        .select('id, sheet, data, week_done, updated_at')
        .eq('user_id', reviewState.userId)
        .eq('week', weekNum);

      if (res.error) {
        if (reviewSheetContent) reviewSheetContent.textContent = 'No se pudo cargar notas.';
        reviewState.notesBySheet = { dc: null, takers: null, cultos: null, lideres: null };
        reviewState.noteIdForFeedback = null;
        await loadReviewComments();
        return;
      }

      const rows = res.data || [];
      const by = { dc: null, takers: null, cultos: null, lideres: null };
      rows.forEach(r => {
        if (!r || !r.sheet) return;
        const k = String(r.sheet);
        if (k in by) by[k] = r;
      });
      reviewState.notesBySheet = by;
      reviewState.noteIdForFeedback = rows[0]?.id || null;

      // Default: mostrar dinámica
      showReviewSheet('dc', 'Dinámica celular');
      await loadReviewComments();
    };

    const upsertReviewDone = async (val) => {
      if (!reviewState.userId || !reviewState.week) return;
      const res = await supabase
        .from('note_reviews')
        .upsert({ leader_id: user.id, user_id: reviewState.userId, week: reviewState.week, review_done: !!val },
          { onConflict: 'leader_id,user_id,week' });
      if (!res.error) {
        reviewState.weeksReviewed[String(reviewState.week)] = !!val;
        paintReviewWeekTiles();
      }
    };

    btnReviewBackToWeeks?.addEventListener('click', () => {
      reviewState.week = null;
      resetReviewWeekUI();
      paintReviewWeekTiles();
    });

    btnReviewSheetBack?.addEventListener('click', () => {
      reviewSheetScreen?.classList.add('is-hidden');
    });

    btnReviewDinamica?.addEventListener('click', () => showReviewSheet('dc', 'Dinámica celular'));
    btnReviewTakers?.addEventListener('click', () => showReviewSheet('takers', 'Takers'));
    btnReviewCultos?.addEventListener('click', () => showReviewSheet('cultos', 'Cultos'));
    btnReviewLideres?.addEventListener('click', () => showReviewSheet('lideres', 'Reunión de Líderes/Ministerios'));

    reviewUserSelect?.addEventListener('change', () => onSelectReviewUser());

    chkWeekReviewed?.addEventListener('change', () => {
      upsertReviewDone(!!chkWeekReviewed.checked);
    });

    btnAddReviewComment?.addEventListener('click', async (e) => {
      e.preventDefault();
      const txt = (reviewComment?.value || '').trim();
      if (!txt) return;
      if (!reviewState.noteIdForFeedback) {
        setReviewCommentStatus('No se puede guardar (no hay notas de esa semana).');
        return;
      }
      setReviewCommentStatus('Guardando…');
      const res = await supabase
        .from('note_feedback')
        .insert({ note_id: reviewState.noteIdForFeedback, reviewer_id: user.id, comment: txt });
      if (res.error) {
        setReviewCommentStatus('No se pudo guardar la nota (permisos).');
        return;
      }
      if (reviewComment) reviewComment.value = '';
      setReviewCommentStatus('Guardado.');
      await loadReviewComments();
    });

    // Mostrar acceso "Revisión de Notas" solo a leaders
    (async () => {
      try {
        const role = await getRole();
        if (role === 'leader') {
          navReviewNotes?.classList.remove('is-hidden');
          cardReviewNotes?.classList.remove('is-hidden');
        }
      } catch {}
    })();

    const initReviewView = async () => {
      try {
        const role = await getRole();
        if (role !== 'leader') {
          setReviewStatus('Solo disponible para líderes.');
          return;
        }
        if (reviewWeeksGrid && !reviewWeeksGrid.dataset.ready) {
          populateReviewWeeks();
          reviewWeeksGrid.dataset.ready = '1';
        }
        resetReviewWeekUI();
        await loadReviewUsers();
        if (reviewUserSelect && reviewUserSelect.value) {
          await onSelectReviewUser();
        }
      } catch {
        setReviewStatus('No se pudo iniciar Revisión de Notas.');
      }
    };


    // ---- Anuncios (tabla announcements + Storage bucket announcements)
    const announcementsList = qs('#announcementsList');

    const renderAnnouncements = (rows) => {
      if (!announcementsList) return;
      const data = Array.isArray(rows) ? rows : [];
      if (!data.length) {
        announcementsList.innerHTML = '<div class="muted">No hay anuncios.</div>';
        return;
      }

      announcementsList.innerHTML = data.map(r => {
        const title = escapeHtml(r.title || 'Anuncio');
        const url = r.image_url || '';
        const safeUrl = escapeHtml(url);

        const img = url
          ? (
            '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="text-decoration:none;display:block;">'
              + '<img src="' + safeUrl + '" alt="' + title + '" '
                + 'style="max-width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;"/>'
            + '</a>'
          )
          : '<div class="muted">(sin imagen)</div>';

        const actions = url
          ? (
            '<div style="display:flex;gap:10px;align-items:center;">'
              + '<a class="pill" href="' + safeUrl + '" download title="Descargar" aria-label="Descargar" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">⬇️</a>'
              + '<a class="pill" href="' + safeUrl + '" target="_blank" rel="noopener" title="Abrir" aria-label="Abrir" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">🔍</a>'
            + '</div>'
          )
          : '';

        return (
          '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px;display:grid;gap:10px;">'
            + '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;">'
              + '<div style="min-width:0;font-weight:800;">' + title + '</div>'
              + actions
            + '</div>'
            + img
          + '</div>'
        );
      }).join('');
    };

    const loadAnnouncements = async () => {
      if (!announcementsList) return;
      announcementsList.textContent = 'Cargando…';

      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        announcementsList.innerHTML = '<div class="msg err">' + escapeHtml(error.message) + '</div>';
        return;
      }

      renderAnnouncements(data);
    };


    // ---- Material de apoyo (tabla materials + Storage bucket materials)
    const supportGrid = qs('#supportGrid');

    const renderMaterials = (rows) => {
      if (!supportGrid) return;
      const data = Array.isArray(rows) ? rows : [];
      if (!data.length) {
        supportGrid.innerHTML = '<div class="muted">No hay material de apoyo.</div>';
        return;
      }

      supportGrid.innerHTML = data.map(r => {
        const title = escapeHtml(r.title || 'Material');
        const url = r.image_url || '';
        const safeUrl = escapeHtml(url);

        const img = url
          ? (
            '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="text-decoration:none;display:block;">'
              + '<img src="' + safeUrl + '" alt="' + title + '" '
                + 'style="width:100%;border-radius:12px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;"/>'
            + '</a>'
          )
          : '<div class="muted">(sin imagen)</div>';

        const actions = url
          ? (
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
              + '<a class="pill" href="' + safeUrl + '" download title="Descargar" aria-label="Descargar" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">⬇️</a>'
              + '<a class="pill" href="' + safeUrl + '" target="_blank" rel="noopener" title="Abrir" aria-label="Abrir" '
                + 'style="text-decoration:none;min-width:44px;text-align:center;">🔍</a>'
            + '</div>'
          )
          : '';

        return (
          '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px;display:grid;gap:10px;">'
            + '<div style="font-weight:800;">' + title + '</div>'
            + img
            + actions
          + '</div>'
        );
      }).join('');
    };

    const loadMaterials = async () => {
      if (!supportGrid) return;
      supportGrid.textContent = 'Cargando…';

      const { data, error } = await supabase
        .from('materials')
        .select('id, title, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        supportGrid.innerHTML = '<div class="msg err">' + escapeHtml(error.message) + '</div>';
        return;
      }

      renderMaterials(data);
    };

    const fmtInvestment = (v) => {
      if (v == null || v === '') return '';
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const readActivityFromPrompts = (seed = {}) => {
      const activity = prompt('Actividad:', seed.activity || '');
      if (activity === null) return null;

      const event_date = prompt('Fecha (YYYY-MM-DD):', seed.event_date || '');
      if (event_date === null) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(event_date.trim())) {
        alert('Fecha inválida. Usa el formato YYYY-MM-DD.');
        return null;
      }

      const owner_name = prompt('Encargado:', seed.owner_name || '');
      if (owner_name === null) return null;

      const contact_phone = prompt('#Contacto:', seed.contact_phone || '');
      if (contact_phone === null) return null;

      const invRaw = prompt('Inversión (número):', (seed.investment ?? '') === '' ? '' : String(seed.investment));
      if (invRaw === null) return null;
      const investment = invRaw.trim() === '' ? null : Number(invRaw);
      if (investment !== null && Number.isNaN(investment)) {
        alert('Inversión inválida. Debe ser un número (o dejar vacío).');
        return null;
      }

      return {
        activity: activity.trim(),
        event_date: event_date.trim(),
        owner_name: owner_name.trim(),
        contact_phone: contact_phone.trim(),
        investment,
      };
    };

    const renderCalendarTable = (rows, isAdmin) => {
      if (!calendarContainer) return;

      const headCells = [
        '<th>Actividad</th>',
        '<th>Fecha</th>',
        '<th>Encargado</th>',
        '<th>#Contacto</th>',
        '<th>Inversión</th>',
      ];
      if (isAdmin) headCells.append('<th class="cal-actions">Acciones</th>');

      const body = (rows || []).map(r => {
        const cells = [
          `<td>${escapeHtml(r.activity)}</td>`,
          `<td>${escapeHtml(r.event_date)}</td>`,
          `<td>${escapeHtml(r.owner_name)}</td>`,
          `<td>${escapeHtml(r.contact_phone)}</td>`,
          `<td>${escapeHtml(fmtInvestment(r.investment))}</td>`,
        ];
        if (isAdmin) {
          cells.append(
            `<td class="cal-actions">` +
              `<button class="pill" data-cal-action="edit" data-id="${escapeHtml(r.id)}" type="button">Editar</button> ` +
              `<button class="pill danger" data-cal-action="delete" data-id="${escapeHtml(r.id)}" type="button">Eliminar</button>` +
            `</td>`
          );
        }
        return `<tr>${cells.join('')}</tr>`;
      }).join('');

      calendarContainer.innerHTML = `
        <table class="table cal-table" id="calendarTable">
          <thead><tr>${headCells.join('')}</tr></thead>
          <tbody id="calendarBody">${body || ''}</tbody>
        </table>
      `;
    };

    const loadCalendar = async () => {
      if (!calendarContainer) return;

      setStatus(calendarStatus, 'Cargando…');

      const role = await getRole();
      const isAdmin = role === 'admin';

      if (btnCalNew) btnCalNew.style.display = isAdmin ? '' : 'none';

      const { data, error } = await supabase
        .from('calendar_activities')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) {
        setStatus(calendarStatus, 'Error cargando calendario.');
        calendarContainer.textContent = 'No se pudo cargar.';
        return;
      }

      renderCalendarTable(data || [], isAdmin);
      setStatus(calendarStatus, `Registros: ${(data || []).length}`);
    };

    const createCalendarActivity = async () => {
      const role = await getRole();
      if (role !== 'admin') return;

      const payload = readActivityFromPrompts({});
      if (!payload) return;

      setStatus(calendarStatus, 'Guardando…');

      const { error } = await supabase
        .from('calendar_activities')
        .insert({ ...payload, created_by: user.id });

      if (error) {
        setStatus(calendarStatus, 'Error al guardar.');
        alert('No se pudo crear la actividad.');
        return;
      }

      await loadCalendar();
      setStatus(calendarStatus, 'Actividad creada.');
    };

    const editCalendarActivity = async (id) => {
      const role = await getRole();
      if (role !== 'admin') return;

      const { data, error } = await supabase
        .from('calendar_activities')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        alert('No se pudo cargar la actividad.');
        return;
      }

      const payload = readActivityFromPrompts(data);
      if (!payload) return;

      setStatus(calendarStatus, 'Actualizando…');

      const upd = await supabase
        .from('calendar_activities')
        .update(payload)
        .eq('id', id);

      if (upd.error) {
        setStatus(calendarStatus, 'Error al actualizar.');
        alert('No se pudo actualizar la actividad.');
        return;
      }

      await loadCalendar();
      setStatus(calendarStatus, 'Actividad actualizada.');
    };

    const deleteCalendarActivity = async (id) => {
      const role = await getRole();
      if (role !== 'admin') return;

      const ok = confirm('¿Eliminar esta actividad?');
      if (!ok) return;

      setStatus(calendarStatus, 'Eliminando…');

      const del = await supabase
        .from('calendar_activities')
        .delete()
        .eq('id', id);

      if (del.error) {
        setStatus(calendarStatus, 'Error al eliminar.');
        alert('No se pudo eliminar la actividad.');
        return;
      }

      await loadCalendar();
      setStatus(calendarStatus, 'Actividad eliminada.');
    };

    btnCalNew?.addEventListener('click', (e) => {
      e.preventDefault();
      createCalendarActivity();
    });

    calendarContainer?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cal-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-cal-action');
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (action === 'edit') editCalendarActivity(id);
      if (action === 'delete') deleteCalendarActivity(id);
    });


    // ---- Notas: mini calendario de 52 semanas (solo) + pantalla de semana con botones + semana completada
    const weeksGrid = qs('#weeksGrid');
    const weekTitle = qs('#weekTitle');
    const notesMeta = qs('#notesMeta');
    const notesHint = qs('#notesHint');

    const notesWeekPicker = qs('#notesWeekPicker');
    const notesWeekScreen = qs('#notesWeekScreen');
    const notesSheetScreen = qs('#notesSheetScreen');
    const notesSheetTakers = qs('#notesSheetTakers');
    const notesSheetCultos = qs('#notesSheetCultos');
    const notesSheetLideres = qs('#notesSheetLideres');
    const takersSheetTitle = qs('#takersSheetTitle');
    const cultosSheetTitle = qs('#cultosSheetTitle');
    const lideresSheetTitle = qs('#lideresSheetTitle');
    const takersNotes = qs('#takersNotes');
    const cultosNotes = qs('#cultosNotes');
    const lideresNotes = qs('#lideresNotes');
    const takersTema = qs('#takersTema');
    const cultosTema = qs('#cultosTema');
    const lideresTema = qs('#lideresTema');
    const takersDate = qs('#takersDate');
    const cultosDate = qs('#cultosDate');
    const lideresDate = qs('#lideresDate');
    const takersMeta = qs('#takersMeta');
    const cultosMeta = qs('#cultosMeta');
    const lideresMeta = qs('#lideresMeta');
    const takersStatus = qs('#takersStatus');
    const cultosStatus = qs('#cultosStatus');
    const lideresStatus = qs('#lideresStatus');
    const dcSheetTitle = qs('#dcSheetTitle');
    const dcDate = qs('#dcDate');
    const btnDcRowAdd = qs('#btnDcRowAdd');
    const btnDcRowRemove = qs('#btnDcRowRemove');
    const dcFollowBody = qs('#dcFollowBody');
    const dcNotes = qs('#dcNotes');
    const dcStatus = qs('#dcStatus');

    // Botones únicos Atrás/Guardar/Compartir, ubicados junto al tail del <h1>Notas</h1>
    const notesHeaderActions = qs('#notesHeaderActions');
    const notesBtnBack = qs('#notesBtnBack');
    const notesBtnShare = qs('#notesBtnShare');
    const notesBtnSave = qs('#notesBtnSave');

    // Modal de confirmación al salir de una hoja con cambios sin guardar
    const notesLeaveModal = qs('#notesLeaveModal');
    const notesLeaveDiscardBtn = qs('#notesLeaveDiscard');
    const notesLeaveSaveBtn = qs('#notesLeaveSave');
    notesLeaveDiscardBtn?.addEventListener('click', () => closeNotesLeaveModal('discard'));
    notesLeaveSaveBtn?.addEventListener('click', () => closeNotesLeaveModal('save'));

    const chkWeekDone = qs('#chkWeekDone');

    const btnNoteDinamica = qs('#btnNoteDinamica');
    const btnNoteTakers = qs('#btnNoteTakers');
    const btnNoteCultos = qs('#btnNoteCultos');
    const btnNoteLideres = qs('#btnNoteLideres');

    const STORAGE_KEY = 'bitacora_week_completed_v1';
    const completed = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
      catch { return {}; }
    })();

    const saveCompleted = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(completed)); } catch {}
    };

    const setWeekScreenVisible = (visible) => {
      notesWeekPicker.classList.toggle('is-hidden', visible);
      notesWeekScreen.classList.toggle('is-hidden', !visible);
      if (notesSheetScreen) notesSheetScreen.classList.add('is-hidden');
      state.dcOpen = false;
      state.notesOpenSheet = null;
	      // Si el elemento fue fijado (p.ej. convertido a botón "Inicio"), no sobrescribimos su texto.
	      if (notesHint && !notesHint.dataset.fixed) {
	        notesHint.textContent = visible ? 'Semana seleccionada: elige una actividad.' : 'Selecciona la semana.';
	      }
    };

    const hideAllNoteSheets = () => {
      notesSheetScreen?.classList.add('is-hidden');
      notesSheetTakers?.classList.add('is-hidden');
      notesSheetCultos?.classList.add('is-hidden');
      notesSheetLideres?.classList.add('is-hidden');
      state.notesOpenSheet = null;
    };

    const showNoteSheet = (sheetEl) => {
      if (!sheetEl) return;
      notesWeekPicker?.classList.add('is-hidden');
      notesWeekScreen?.classList.add('is-hidden');
      hideAllNoteSheets();
      sheetEl.classList.remove('is-hidden');

      // tracking de hoja abierta
      if (sheetEl === notesSheetScreen) state.notesOpenSheet = 'dc';
      else if (sheetEl === notesSheetTakers) state.notesOpenSheet = 'takers';
      else if (sheetEl === notesSheetCultos) state.notesOpenSheet = 'cultos';
      else if (sheetEl === notesSheetLideres) state.notesOpenSheet = 'lideres';
      else state.notesOpenSheet = null;
    };

    const setSheetVisible = (visible) => {
      // Compat: mantiene la hoja de Dinámica Celular
      if (visible) {
        showNoteSheet(notesSheetScreen);
        state.dcOpen = true;
      } else {
        hideAllNoteSheets();
        notesWeekPicker?.classList.add('is-hidden');
        notesWeekScreen?.classList.remove('is-hidden');
        state.dcOpen = false;
        if (dcStatus) dcStatus.textContent = '';
      }
    };

    const markWeekTile = (weekNum) => {
      const tile = qs(`.week[data-week="${weekNum}"]`, weeksGrid);
      if (!tile) return;
      tile.classList.toggle('is-done', !!completed[String(weekNum)]);
    };

    const updateMeta = () => {
      if (!state.selectedWeek) { notesMeta.textContent = ''; return; }
      const done = !!completed[String(state.selectedWeek)];
      notesMeta.textContent = done ? `Semana ${state.selectedWeek} • Completada` : `Semana ${state.selectedWeek}`;
    };

    const populateWeeks = () => {
      if (!weeksGrid) return;
      weeksGrid.innerHTML = '';
      for (let i=1; i<=52; i++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'week';
        b.textContent = `Sem ${i}`;
        b.title = `Semana ${i}: ${weekRangeLabel(i)}`;
        b.dataset.week = String(i);
        b.addEventListener('click', () => selectWeek(i));
        weeksGrid.appendChild(b);
        markWeekTile(i);
      }
    };

    const selectWeek = (weekNum) => {
      state.selectedWeek = weekNum;

      qsa('.week', weeksGrid).forEach(w => w.classList.toggle('is-selected', Number(w.dataset.week) === weekNum));
      weekTitle.textContent = `Semana ${weekNum} · ${weekRangeLabel(weekNum)}`;

      // Checkbox refleja estado de la semana
      if (chkWeekDone) chkWeekDone.checked = !!completed[String(weekNum)];

      // Mostrar pantalla de semana
      setWeekScreenVisible(true);
      updateMeta();
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    // Volver del detalle de semana al selector (usada por el botón único Atrás)
    const backToWeekPicker = async () => {
      if (!(await confirmLeaveNotesSheet())) return;
      // quitar selección visual
      qsa('.week', weeksGrid).forEach(w => w.classList.remove('is-selected'));
      state.selectedWeek = null;
      if (chkWeekDone) chkWeekDone.checked = false;
      setWeekScreenVisible(false);
      updateMeta();
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    // Marcar semana como completada (solo UI; se mantiene en localStorage)
    chkWeekDone?.addEventListener('change', () => {
      if (!state.selectedWeek) return;
      completed[String(state.selectedWeek)] = !!chkWeekDone.checked;
      saveCompleted();
      markWeekTile(state.selectedWeek);
      updateMeta();
    });

  const todayISO = () => new Date().toISOString().slice(0, 10);

    // ---- Fechas reales por semana (lunes-domingo), año dinámico (siempre el actual) ----
    // Mismo algoritmo que "Control_Asistencia_Lider", pero sin año hardcodeado:
    // usa new Date().getFullYear(), así que funciona indefinidamente sin mantenimiento.
    const getWeekMonday = (weekNum, year) => {
      const firstMonday = new Date(year, 0, 1);
      const fdow = firstMonday.getDay(); // 0=dom, 1=lun ... 6=sab
      const diffFM = (fdow === 0) ? -6 : 1 - fdow;
      firstMonday.setDate(firstMonday.getDate() + diffFM);
      const monday = new Date(firstMonday);
      monday.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
      return monday;
    };

    const getWeekRange = (weekNum, year = new Date().getFullYear()) => {
      const monday = getWeekMonday(weekNum, year);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { monday, sunday };
    };

    const fmtWeekDay = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

    // "16 mar – 22 mar" — solo para mostrar, no se guarda en Supabase.
    const weekRangeLabel = (weekNum) => {
      const { monday, sunday } = getWeekRange(weekNum);
      return `${fmtWeekDay(monday)} – ${fmtWeekDay(sunday)}`;
    };

    // ISO (YYYY-MM-DD) del lunes de esa semana, para precargar dcDate.
    const weekMondayISO = (weekNum) => {
      const { monday } = getWeekRange(weekNum);
      return monday.toISOString().slice(0, 10);
    };

    // Día fijo dentro de la semana: offset 0=lunes, 5=sábado, 6=domingo.
    // Usado para Takers (sábado), Cultos (domingo) y Reuniones (lunes) — a diferencia
    // de Célula, cuyo día varía y por eso no tiene fecha fija asociada.
    const getWeekWeekday = (weekNum, dayOffset, year = new Date().getFullYear()) => {
      const { monday } = getWeekRange(weekNum, year);
      const d = new Date(monday);
      d.setDate(monday.getDate() + dayOffset);
      return d;
    };

    // "Sábado 08 ago" — nota informativa, no es un campo editable.
    const fmtWeekdayNote = (d) => {
      const s = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    const setDateIfEmpty = (dateEl) => {
      if (!dateEl) return;
      if (!dateEl.value) dateEl.value = todayISO();
    };

    const setDcDirty = (dirty = true) => {
      if (!state.dcOpen) return;
      state.dcDirty = dirty;
      if (dcStatus) dcStatus.textContent = dirty ? 'Cambios sin guardar.' : '';
      updateSaveButtonState();
    };

    // Marcar cambios (placeholder de auto-guardado)
    const setTakersDirty = (dirty = true) => { state.takersDirty = dirty; if (takersStatus) takersStatus.textContent = dirty ? 'Cambios sin guardar.' : ''; updateSaveButtonState(); };
    const setCultosDirty = (dirty = true) => { state.cultosDirty = dirty; if (cultosStatus) cultosStatus.textContent = dirty ? 'Cambios sin guardar.' : ''; updateSaveButtonState(); };
    const setLideresDirty = (dirty = true) => { state.lideresDirty = dirty; if (lideresStatus) lideresStatus.textContent = dirty ? 'Cambios sin guardar.' : ''; updateSaveButtonState(); };

    notesSheetScreen?.addEventListener('input', () => setDcDirty(true));
    notesSheetScreen?.addEventListener('change', () => setDcDirty(true));

    notesSheetTakers?.addEventListener('input', () => setTakersDirty(true));
    notesSheetTakers?.addEventListener('change', () => setTakersDirty(true));
    notesSheetCultos?.addEventListener('input', () => setCultosDirty(true));
    notesSheetCultos?.addEventListener('change', () => setCultosDirty(true));
    notesSheetLideres?.addEventListener('input', () => setLideresDirty(true));
    notesSheetLideres?.addEventListener('change', () => setLideresDirty(true));

    const initDcDefaults = () => {
      const t = todayISO();
      if (dcDate && !dcDate.value) dcDate.value = t;
      qsa('input[type="date"]', notesSheetScreen || document).forEach(el => {
        if (!el.value) el.value = t;
      });
    };

    // ---- Wheel de tiempo (0-60) para las tarjetas de Dinámica Celular ----
    const DC_WHEEL_MIN = 0;
    const DC_WHEEL_MAX = 60;
    const DC_WHEEL_ITEM_H = 36; // debe coincidir con .dc-wheel__option { height:36px } en app.css

    const closeAllDcWheels = (exceptPanel) => {
      qsa('.dc-wheel__panel', notesSheetScreen || document).forEach(panel => {
        if (panel === exceptPanel) return;
        panel.classList.add('is-hidden');
      });
    };

    const setDcWheelActiveOption = (wheelEl, idx) => {
      qsa('.dc-wheel__option', wheelEl).forEach(opt => {
        opt.classList.toggle('is-active', Number(opt.dataset.val) === idx);
      });
    };

    // Solo escribe/dispara evento si el valor realmente cambia: así el campo
    // permanece vacío ("__") hasta que el usuario mueve o toca la rueda.
    const commitDcWheelValue = (wheelEl, idx) => {
      const valueInput = qs('.dc-wheel__value', wheelEl);
      if (!valueInput) return;
      const v = String(idx);
      if (valueInput.value !== v) {
        valueInput.value = v;
        valueInput.dispatchEvent(new Event('input', { bubbles: true }));
        valueInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const buildDcWheelOptions = (wheelEl) => {
      const list = qs('.dc-wheel__list', wheelEl);
      if (!list || list.dataset.built === '1') return;
      const frag = document.createDocumentFragment();
      for (let i = DC_WHEEL_MIN; i <= DC_WHEEL_MAX; i++) {
        const opt = document.createElement('div');
        opt.className = 'dc-wheel__option';
        opt.dataset.val = String(i);
        opt.textContent = String(i);
        frag.appendChild(opt);
      }
      list.appendChild(frag);
      list.dataset.built = '1';
    };

    // Abre el panel posicionado en el valor actual (si el usuario ya eligió uno)
    // o en el "ref" de la tarjeta (precargado internamente, sin mostrarse antes de tocar).
    const openDcWheelPanel = (wheelEl) => {
      const panel = qs('.dc-wheel__panel', wheelEl);
      const list = qs('.dc-wheel__list', wheelEl);
      const valueInput = qs('.dc-wheel__value', wheelEl);
      if (!panel || !list || !valueInput) return;

      closeAllDcWheels(panel);
      closeAllNameWheels();
      closeAllOptWheels();
      panel.classList.remove('is-hidden');

      const ref = parseInt(wheelEl.dataset.ref, 10) || 0;
      const hasValue = valueInput.value !== '';
      const parsed = parseInt(valueInput.value, 10);
      const idx = Math.min(DC_WHEEL_MAX, Math.max(DC_WHEEL_MIN, hasValue && !isNaN(parsed) ? parsed : ref));

      list.scrollTop = idx * DC_WHEEL_ITEM_H;
      setDcWheelActiveOption(wheelEl, idx);
    };

    const initDcWheels = () => {
      qsa('.dc-wheel', notesSheetScreen || document).forEach(wheelEl => {
        if (wheelEl.dataset.wheelInit === '1') return;
        wheelEl.dataset.wheelInit = '1';

        buildDcWheelOptions(wheelEl);

        const valueInput = qs('.dc-wheel__value', wheelEl);
        const list = qs('.dc-wheel__list', wheelEl);
        const panel = qs('.dc-wheel__panel', wheelEl);
        if (!valueInput || !list || !panel) return;

        valueInput.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = !panel.classList.contains('is-hidden');
          if (isOpen) panel.classList.add('is-hidden');
          else openDcWheelPanel(wheelEl);
        });

        // Detecta la opción centrada por scroll-snap; commitea solo cuando el scroll se asienta.
        let scrollTimer = null;
        list.addEventListener('scroll', () => {
          const liveIdx = Math.min(DC_WHEEL_MAX, Math.max(DC_WHEEL_MIN, Math.round(list.scrollTop / DC_WHEEL_ITEM_H)));
          setDcWheelActiveOption(wheelEl, liveIdx);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const settledIdx = Math.min(DC_WHEEL_MAX, Math.max(DC_WHEEL_MIN, Math.round(list.scrollTop / DC_WHEEL_ITEM_H)));
            commitDcWheelValue(wheelEl, settledIdx);
          }, 140);
        });

        // Click directo sobre un número: lo confirma y cierra el panel de inmediato.
        list.addEventListener('click', (e) => {
          const opt = e.target.closest('.dc-wheel__option');
          if (!opt) return;
          const idx = Number(opt.dataset.val);
          commitDcWheelValue(wheelEl, idx);
          panel.classList.add('is-hidden');
        });
      });
    };

    // ---- Wheel de nombres (Responsable) — lista dinámica de discípulos + visitas ----
    const NAME_WHEEL_ITEM_H = 36; // debe coincidir con .dc-namewheel__option { height:36px }

    const closeAllNameWheels = (exceptPanel) => {
      qsa('.dc-namewheel__panel', notesSheetScreen || document).forEach(panel => {
        if (panel === exceptPanel) return;
        panel.classList.add('is-hidden');
      });
    };

    // "El Líder" siempre primero (única persona fuera de la lista de discípulos),
    // luego los nombres en el mismo orden en que aparecen en las tablas.
    const getDiscipuloNames = () => {
      const mainNames  = qsa('.in-n', qs('#attMainBody')  || document).map(el => el.value.trim()).filter(Boolean);
      const visitNames = qsa('.in-n', qs('#attVisitBody') || document).map(el => el.value.trim()).filter(Boolean);
      return ['El Líder', ...mainNames, ...visitNames];
    };

    const setNameWheelActiveOption = (wheelEl, idx) => {
      qsa('.dc-namewheel__option', wheelEl).forEach(opt => {
        opt.classList.toggle('is-active', Number(opt.dataset.idx) === idx);
      });
    };

    const commitNameWheelValue = (wheelEl, name) => {
      const valueInput = qs('.dc-namewheel__value', wheelEl);
      if (!valueInput || name == null) return;
      if (valueInput.value !== name) {
        valueInput.value = name;
        valueInput.dispatchEvent(new Event('input', { bubbles: true }));
        valueInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const buildNameWheelOptions = (wheelEl, names) => {
      const list = qs('.dc-namewheel__list', wheelEl);
      if (!list) return;
      list.innerHTML = '';
      const frag = document.createDocumentFragment();
      names.forEach((name, i) => {
        const opt = document.createElement('div');
        opt.className = 'dc-namewheel__option';
        opt.dataset.idx = String(i);
        opt.textContent = name;
        frag.appendChild(opt);
      });
      list.appendChild(frag);
    };

    // Reconstruye la lista EN CADA APERTURA (a diferencia del wheel de tiempo,
    // que se construye una sola vez): los discípulos pueden cambiar mientras
    // la hoja está abierta, ya que Asistencia vive en la misma pantalla.
    const openNameWheelPanel = (wheelEl) => {
      const panel = qs('.dc-namewheel__panel', wheelEl);
      const list = qs('.dc-namewheel__list', wheelEl);
      const valueInput = qs('.dc-namewheel__value', wheelEl);
      if (!panel || !list || !valueInput) return;

      const names = getDiscipuloNames();
      buildNameWheelOptions(wheelEl, names);

      closeAllDcWheels();
      closeAllNameWheels(panel);
      closeAllOptWheels();
      panel.classList.remove('is-hidden');

      // Si el valor actual sigue en la lista, posiciona ahí; si no, "El Líder" (idx 0).
      let idx = names.indexOf(valueInput.value);
      if (idx < 0) idx = 0;

      list.scrollTop = idx * NAME_WHEEL_ITEM_H;
      setNameWheelActiveOption(wheelEl, idx);
    };

    const initNameWheels = () => {
      qsa('.dc-namewheel', notesSheetScreen || document).forEach(wheelEl => {
        if (wheelEl.dataset.wheelInit === '1') return;
        wheelEl.dataset.wheelInit = '1';

        const valueInput = qs('.dc-namewheel__value', wheelEl);
        const list = qs('.dc-namewheel__list', wheelEl);
        const panel = qs('.dc-namewheel__panel', wheelEl);
        if (!valueInput || !list || !panel) return;

        valueInput.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = !panel.classList.contains('is-hidden');
          if (isOpen) panel.classList.add('is-hidden');
          else openNameWheelPanel(wheelEl);
        });

        let scrollTimer = null;
        const clampIdx = (raw) => {
          const max = Math.max(0, qsa('.dc-namewheel__option', wheelEl).length - 1);
          return Math.min(max, Math.max(0, raw));
        };
        list.addEventListener('scroll', () => {
          const liveIdx = clampIdx(Math.round(list.scrollTop / NAME_WHEEL_ITEM_H));
          setNameWheelActiveOption(wheelEl, liveIdx);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const settledIdx = clampIdx(Math.round(list.scrollTop / NAME_WHEEL_ITEM_H));
            const chosen = qsa('.dc-namewheel__option', wheelEl)[settledIdx];
            if (chosen) commitNameWheelValue(wheelEl, chosen.textContent);
          }, 140);
        });

        list.addEventListener('click', (e) => {
          const opt = e.target.closest('.dc-namewheel__option');
          if (!opt) return;
          commitNameWheelValue(wheelEl, opt.textContent);
          panel.classList.add('is-hidden');
        });
      });
    };

    // ---- Wheel de opciones (selects estáticos: Equipos/Sección/Líder en
    // Asistencia). Mismo patrón visual y de scroll-snap que el wheel de
    // nombres, pero como clase aparte (.dc-optwheel) para no colisionar con
    // initNameWheels(). El <select> real (oculto) sigue siendo la fuente de
    // verdad: se le asigna .selectedIndex y se dispara 'change' sobre él,
    // así toda la lógica existente en el widget de Asistencia sigue intacta. ----
    const OPT_WHEEL_ITEM_H = 36; // debe coincidir con .dc-optwheel__option { height:36px }

    const closeAllOptWheels = (exceptPanel) => {
      qsa('.dc-optwheel__panel', notesSheetScreen || document).forEach(panel => {
        if (panel === exceptPanel) return;
        panel.classList.add('is-hidden');
      });
    };

    const setOptWheelActiveOption = (wheelEl, idx) => {
      qsa('.dc-optwheel__option', wheelEl).forEach(opt => {
        opt.classList.toggle('is-active', Number(opt.dataset.idx) === idx);
      });
    };

    const buildOptWheelOptions = (wheelEl, selectEl) => {
      const list = qs('.dc-optwheel__list', wheelEl);
      if (!list) return;
      list.innerHTML = '';
      const frag = document.createDocumentFragment();
      Array.from(selectEl.options).forEach((o, i) => {
        const opt = document.createElement('div');
        opt.className = 'dc-optwheel__option';
        opt.dataset.idx = String(i);
        opt.textContent = o.textContent;
        frag.appendChild(opt);
      });
      list.appendChild(frag);
    };

    // Refleja en el input visible el texto de la opción actualmente
    // seleccionada en el <select> real. Se usa tanto al inicializar el
    // wheel como después de que app.js reconstruya las opciones del
    // <select> por su cuenta (p.ej. attApplyColor / attUpdateLeaderDropdownSilent).
    const syncOptWheelLabel = (wheelEl, selectEl) => {
      const valueInput = qs('.dc-optwheel__value', wheelEl);
      if (!valueInput || !selectEl) return;
      const opt = selectEl.options[selectEl.selectedIndex];
      valueInput.value = opt ? opt.textContent : '';
    };

    // Punto de entrada usado desde fuera (widget de Asistencia): busca el
    // wheel asociado a un <select> por su id y sincroniza su texto visible.
    const syncOptWheelLabelForSelect = (selectEl) => {
      if (!selectEl || !selectEl.id) return;
      const wheelEl = qs(`.dc-optwheel[data-for-select="${selectEl.id}"]`, notesSheetScreen || document);
      if (wheelEl) syncOptWheelLabel(wheelEl, selectEl);
    };

    const openOptWheelPanel = (wheelEl, selectEl) => {
      const panel = qs('.dc-optwheel__panel', wheelEl);
      const list = qs('.dc-optwheel__list', wheelEl);
      if (!panel || !list) return;

      buildOptWheelOptions(wheelEl, selectEl);
      closeAllDcWheels();
      closeAllNameWheels();
      closeAllOptWheels(panel);
      panel.classList.remove('is-hidden');

      const idx = Math.max(0, selectEl.selectedIndex);
      list.scrollTop = idx * OPT_WHEEL_ITEM_H;
      setOptWheelActiveOption(wheelEl, idx);
    };

    // Confirma la opción `idx`: mueve el <select> real y dispara 'change'
    // (así attColorSelector/attSectionSelector/attLeaderName reaccionan
    // exactamente igual que si el usuario hubiera usado el <select> nativo).
    const commitOptWheelValue = (wheelEl, selectEl, idx) => {
      const opt = selectEl.options[idx];
      if (!opt) return;
      const changed = selectEl.selectedIndex !== idx;
      selectEl.selectedIndex = idx;
      syncOptWheelLabel(wheelEl, selectEl);
      if (changed) selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const initSelectWheels = () => {
      qsa('.dc-optwheel', notesSheetScreen || document).forEach(wheelEl => {
        if (wheelEl.dataset.wheelInit === '1') return;
        wheelEl.dataset.wheelInit = '1';

        const selectId = wheelEl.dataset.forSelect;
        const selectEl = selectId ? document.getElementById(selectId) : null;
        const valueInput = qs('.dc-optwheel__value', wheelEl);
        const list = qs('.dc-optwheel__list', wheelEl);
        const panel = qs('.dc-optwheel__panel', wheelEl);
        if (!selectEl || !valueInput || !list || !panel) return;

        syncOptWheelLabel(wheelEl, selectEl);

        valueInput.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = !panel.classList.contains('is-hidden');
          if (isOpen) panel.classList.add('is-hidden');
          else openOptWheelPanel(wheelEl, selectEl);
        });

        let scrollTimer = null;
        const clampIdx = (raw) => {
          const max = Math.max(0, selectEl.options.length - 1);
          return Math.min(max, Math.max(0, raw));
        };
        list.addEventListener('scroll', () => {
          const liveIdx = clampIdx(Math.round(list.scrollTop / OPT_WHEEL_ITEM_H));
          setOptWheelActiveOption(wheelEl, liveIdx);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const settledIdx = clampIdx(Math.round(list.scrollTop / OPT_WHEEL_ITEM_H));
            commitOptWheelValue(wheelEl, selectEl, settledIdx);
          }, 140);
        });

        list.addEventListener('click', (e) => {
          const opt = e.target.closest('.dc-optwheel__option');
          if (!opt) return;
          commitOptWheelValue(wheelEl, selectEl, Number(opt.dataset.idx));
          panel.classList.add('is-hidden');
        });
      });
    };

    // Cierra cualquier panel abierto al hacer click fuera o presionar Escape.
    document.addEventListener('click', (e) => {
      if (!notesSheetScreen) return;
      if (e.target.closest && (e.target.closest('.dc-wheel') || e.target.closest('.dc-namewheel') || e.target.closest('.dc-optwheel'))) return;
      closeAllDcWheels();
      closeAllNameWheels();
      closeAllOptWheels();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeAllDcWheels(); closeAllNameWheels(); closeAllOptWheels(); }
    });

    initDcWheels();
    initNameWheels();
    initSelectWheels();

    const rebuildJustNames = () => {
      if (!dcFollowBody) return;
      const rows = qsa('tr', dcFollowBody);
      rows.forEach((tr, idx) => {
        const n = idx + 1;
        qsa('input[type="radio"]', tr).forEach(r => { r.name = `dcJust${n}`; });
      });
      state.dcRowCount = rows.length;
    };

    const makeFollowRow = (n) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="dc-namewheel">
            <input class="input dc-namewheel__value" type="text" readonly placeholder="Nombre" value=""/>
            <div class="dc-namewheel__panel is-hidden">
              <div class="dc-namewheel__marker"></div>
              <div class="dc-namewheel__list"></div>
            </div>
          </div>
        </td>
        <td>
          <div class="dc-namewheel">
            <input class="input dc-namewheel__value" type="text" readonly placeholder="Encargado" value=""/>
            <div class="dc-namewheel__panel is-hidden">
              <div class="dc-namewheel__marker"></div>
              <div class="dc-namewheel__list"></div>
            </div>
          </div>
        </td>
        <td class="dc-table__just">
          <label class="dc-just"><input name="dcJust${n}" type="radio" value="si"/> Sí</label>
          <label class="dc-just"><input name="dcJust${n}" type="radio" value="no"/> No</label>
        </td>
        <td class="dc-table__date"><input class="input" type="date"/></td>
      `;
      // fecha por defecto
      const d = qs('input[type="date"]', tr);
      if (d) d.value = todayISO();
      return tr;
    };

    btnDcRowAdd?.addEventListener('click', () => {
      if (!dcFollowBody) return;
      const n = (qsa('tr', dcFollowBody).length || 0) + 1;
      dcFollowBody.appendChild(makeFollowRow(n));
      rebuildJustNames();
      initNameWheels(); // conecta los .dc-namewheel de la fila recién creada (idempotente)
      setDcDirty(true);
    });

    btnDcRowRemove?.addEventListener('click', () => {
      if (!dcFollowBody) return;
      const rows = qsa('tr', dcFollowBody);
      if (rows.length <= 1) return;
      rows[rows.length - 1].remove();
      rebuildJustNames();
      setDcDirty(true);
    });

    // Asignado dentro del IIFE del widget de Asistencia (más abajo). Se llama
    // desde openDinamicaCelular() cada vez que se abre/cambia de semana.
    let attRefreshForWeek = () => {};

    // ======================================================================
    // Asistencia (app externa integrada) — control de asistencia y ofrendas
    // Adaptado de "Control_Asistencia_Lider.html":
    //  - sin selector de semana propio: usa state.selectedWeek de Bitácora
    //  - variables de color scoped en #dcAttApp (nunca toca --accent global)
    //  - storage local independiente (bitacora_asistencia_v1), NO es parte
    //    del sistema de borradores de Supabase del resto de Dinámica Celular
    //  - modelo por semana: los NOMBRES se heredan hacia adelante desde la
    //    semana más reciente con datos; los checkboxes siempre entran en
    //    blanco; la ofrenda nunca se hereda (siempre nace vacía)
    // ======================================================================
    (() => {
      const attRoot = qs('#dcAttApp');
      if (!attRoot) return; // no está esta sección en esta vista

      const attColorSelector   = qs('#attColorSelector', attRoot);
      const attSectionSelector = qs('#attSectionSelector', attRoot);
      const attLeaderName      = qs('#attLeaderName', attRoot);
      const attOffSinpe        = qs('#attOffSinpe', attRoot);
      const attOffEfectivo     = qs('#attOffEfectivo', attRoot);
      const attTotalOffering   = qs('#attTotalOffering', attRoot);
      const attActiveSectionLabel = qs('#attActiveSectionLabel', attRoot);
      const attActiveVisitLabel   = qs('#attActiveVisitLabel', attRoot);
      const attMainBody  = qs('#attMainBody', attRoot);
      const attVisitBody = qs('#attVisitBody', attRoot);
      const attThCelMain  = qs('#attThCelMain', attRoot);
      const attThRedMain  = qs('#attThRedMain', attRoot);
      const attThCelVisit = qs('#attThCelVisit', attRoot);
      const attThRedVisit = qs('#attThRedVisit', attRoot);
      const attSummaryTitle  = qs('#attSummaryTitle', attRoot);
      const attLblCel = qs('#attLblCel', attRoot);
      const attLblRed = qs('#attLblRed', attRoot);
      const attSumCel = qs('#attSumCel', attRoot);
      const attSumRed = qs('#attSumRed', attRoot);
      const attSumNuevosRow = qs('#attSumNuevosRow', attRoot);
      const attSumNuevos    = qs('#attSumNuevos', attRoot);
      const attAddMain  = qs('#attAddMain', attRoot);
      const attAddVisit = qs('#attAddVisit', attRoot);
      const attCopyTodoBtn     = qs('#attCopyTodo', attRoot);
      const attCopyOfrendasBtn = qs('#attCopyOfrendas', attRoot);

      // ---- Paleta por Unidad: scoped en attRoot, jamás en :root ----
      const ATT_COLOR_THEMES = {
        red:    { accent:'#dc3545', dark:'#b02a37', bg:'#fff5f5', bdr:'#feb2b2' },
        blue:   { accent:'#1d6fa4', dark:'#155780', bg:'#eff8ff', bdr:'#93c5e8' },
        yellow: { accent:'#b7860b', dark:'#8a6408', bg:'#fffdf0', bdr:'#f5d97a' },
        orange: { accent:'#d9600a', dark:'#b04c07', bg:'#fff7f0', bdr:'#f8c49a' },
        green:  { accent:'#1a7a3c', dark:'#145e2d', bg:'#f0fff5', bdr:'#6fcf97' },
        purple: { accent:'#7c3aed', dark:'#5b21b6', bg:'#faf5ff', bdr:'#c4b5fd' }
      };

      const ATT_SECTIONS = {
        rj:     { label:'RJ',     visitLabel:'VISITAS RJ',     copyLabel:'RJ',     copyVisitLabel:'VISITAS RJ' },
        takers: { label:'TAKERS', visitLabel:'VISITAS TAKERS', copyLabel:'TAKERS', copyVisitLabel:'VISITAS TAKERS' },
        makers: { label:'MAKERS', visitLabel:'VISITAS MAKERS', copyLabel:'MAKERS', copyVisitLabel:'VISITAS MAKERS' }
      };

      const ATT_LIDERES = {
        red: {
          rj:     ['Anyel', 'Joel', 'Josue R', 'Waldin'],
          takers: ['EQUIPO Gabriel y Raquel', 'Cynthia', 'Jean', 'Tony R','Enrique y Debbie'],
          makers: ['John y Esther', 'Esther', 'Marina']
        },
        blue: {
          rj:     ['Alex y Yuli', 'Sharon y Abraham', 'Alejandro Duran'],
          takers: ['EQUIPO Alonso y Amanda', 'Evelyn', 'Jorge, Melany', 'Tony G', 'Valery B'],
          makers: ['Pra Francela Virtual', 'Pra. Francela2', 'Ana Yansi', 'Miriam']
        },
        green: {
          rj:     ['Will y Dani', 'Greivin'],
          takers: ['EQUIPO Ariel y Byron', 'Gaudy', 'Iveth', 'Jose y Eva', 'Maiky y Giovanna', 'Sarai Armas'],
          makers: ['Pr. Julio', 'Javier y Yorleni', 'Migdalia']
        },
        orange: {
          rj:     ['Andres Matuz', 'Carolina', 'Josué S', 'Stephen y Valery'],
          takers: ['EQUIPO Angie y Bayron', 'Brayan y Kelly', 'Dago y Maira', 'Jonathan y Priscilla', 'Kenneth'],
          makers: ['Nuria', 'Roxana', 'Yorleny M']
        },
        yellow: {
          rj:     ['Pablo A', 'Sheily', 'Yehilin'],
          takers: ['EQUIPO Aaron y Heyling', 'Abigail', 'Hazel', 'Laura'],
          makers: ['Pr Carlos', 'Alex V', 'Dany y Sandra', 'Gladys', 'Mario Y Ginneth', 'Joyce']
        },
        purple: {
          takers: ['Pra Rita Takers'],
          makers: ['Pra Rita Makers']
        }
      };

      const ATT_STORAGE_KEY = 'bitacora_asistencia_v1';

      // ---- Storage: { weeks: { "5": { leaders: { "red__Anyel": { rj:{main,visit}, takers:{...}, makers:{...}, offering:{sinpe,efectivo} } } } } } ----
      const attReadStore = () => {
        try { return JSON.parse(localStorage.getItem(ATT_STORAGE_KEY) || '{}'); }
        catch { return {}; }
      };
      const attWriteStore = (obj) => {
        try { localStorage.setItem(ATT_STORAGE_KEY, JSON.stringify(obj)); } catch {}
      };

      const attEmptySections = () => ({
        rj:     { main: [], visit: [] },
        takers: { main: [], visit: [] },
        makers: { main: [], visit: [] }
      });

      // Semana más reciente (<= currentWeek) que tenga datos guardados para este leaderKey.
      const attFindInheritedWeek = (store, currentWeek, leaderKey) => {
        for (let w = currentWeek - 1; w >= 1; w--) {
          const entry = store.weeks?.[String(w)]?.leaders?.[leaderKey];
          if (entry) return w;
        }
        return null;
      };

      // Clona solo los NOMBRES de una sección (main/visit), con cel/red/new en false.
      const attCloneNamesOnly = (sections) => {
        const clone = attEmptySections();
        ['rj', 'takers', 'makers'].forEach(sec => {
          ['main', 'visit'].forEach(tbl => {
            clone[sec][tbl] = (sections[sec]?.[tbl] || []).map(r => ({
              name: r.name || '', cel: false, red: false, new: false
            }));
          });
        });
        return clone;
      };

      let attState = {
        color: attColorSelector.value,
        section: attSectionSelector.value,
        currentLeaderKey: null,
        sections: attEmptySections(), // datos EN MEMORIA de la semana/líder activos
        activeWeek: null, // semana que REALMENTE corresponde a lo que hay en el DOM ahora mismo
      };

      const attGetLeaderKey = () => {
        const color  = attColorSelector.value;
        const leader = attLeaderName.value;
        return leader ? `${color}__${leader}` : null;
      };

      // ---- Semana ----
      const attCurrentWeek = () => state.selectedWeek;

      // Carga (con herencia) los datos de un leaderKey para la semana actual.
      // No escribe nada en storage — solo arma attState.sections en memoria.
      // IMPORTANTE: marca activeWeek = la semana que se está cargando. Esto es lo
      // que le dice a attSaveLeaderForWeek/attSaveOffering bajo qué semana guardar,
      // en vez de volver a leer state.selectedWeek (que para cuando se guarda, ya
      // pudo haber cambiado a la semana nueva si el cambio vino de Bitácora).
      const attLoadLeaderForWeek = (leaderKey) => {
        const week = attCurrentWeek();
        attState.activeWeek = week;
        if (!week || !leaderKey) { attState.sections = attEmptySections(); return; }

        const store = attReadStore();
        const ownEntry = store.weeks?.[String(week)]?.leaders?.[leaderKey];
        if (ownEntry) {
          // La semana ya tiene datos propios guardados para este líder: úsalos tal cual.
          attState.sections = {
            rj:     ownEntry.rj     || { main: [], visit: [] },
            takers: ownEntry.takers || { main: [], visit: [] },
            makers: ownEntry.makers || { main: [], visit: [] },
          };
          return;
        }

        // No hay datos propios: heredar nombres de la semana anterior más reciente con datos.
        const inheritedWeek = attFindInheritedWeek(store, week, leaderKey);
        if (inheritedWeek != null) {
          const src = store.weeks[String(inheritedWeek)].leaders[leaderKey];
          attState.sections = attCloneNamesOnly(src);
        } else {
          attState.sections = attEmptySections();
        }
      };

      // Persiste attState.sections (leído del DOM) en attState.activeWeek — la semana
      // a la que REALMENTE corresponde lo que hay en pantalla ahora mismo, no
      // necesariamente state.selectedWeek. La ofrenda se guarda aparte (attSaveOffering),
      // nunca se hereda.
      const attSaveLeaderForWeek = () => {
        const week = attState.activeWeek;
        const leaderKey = attState.currentLeaderKey;
        if (!week || !leaderKey) return;

        attState.sections[attState.section].main  = attGetSectionData(attMainBody, false);
        attState.sections[attState.section].visit = attGetSectionData(attVisitBody, true);

        const store = attReadStore();
        store.weeks = store.weeks || {};
        store.weeks[String(week)] = store.weeks[String(week)] || { leaders: {} };
        store.weeks[String(week)].leaders = store.weeks[String(week)].leaders || {};
        store.weeks[String(week)].leaders[leaderKey] = {
          rj: attState.sections.rj, takers: attState.sections.takers, makers: attState.sections.makers,
        };
        attWriteStore(store);
      };

      const attSaveOffering = () => {
        const week = attState.activeWeek;
        const leaderKey = attState.currentLeaderKey;
        if (!week || !leaderKey) return;
        const store = attReadStore();
        store.weeks = store.weeks || {};
        store.weeks[String(week)] = store.weeks[String(week)] || { leaders: {} };
        store.weeks[String(week)].leaders = store.weeks[String(week)].leaders || {};
        store.weeks[String(week)].leaders[leaderKey] = store.weeks[String(week)].leaders[leaderKey] || {};
        store.weeks[String(week)].leaders[leaderKey].offering = {
          sinpe: attOffSinpe.value || '',
          efectivo: attOffEfectivo.value || '',
        };
        attWriteStore(store);
      };

      const attLoadOffering = () => {
        const week = attState.activeWeek;
        const leaderKey = attState.currentLeaderKey;
        const store = attReadStore();
        const off = (week && leaderKey) ? store.weeks?.[String(week)]?.leaders?.[leaderKey]?.offering : null;
        attOffSinpe.value = off?.sinpe || '';
        attOffEfectivo.value = off?.efectivo || '';
        attCalculateOffering();
      };

      // ---- Paleta / secciones disponibles según Unidad ----
      const attApplyColor = (rerender) => {
        const key = attColorSelector.value;
        const theme = ATT_COLOR_THEMES[key];
        attRoot.style.setProperty('--att-accent', theme.accent);
        attRoot.style.setProperty('--att-accent-dark', theme.dark);
        attRoot.style.setProperty('--att-accent-bg', theme.bg);
        attRoot.style.setProperty('--att-accent-bdr', theme.bdr);

        const isEquipos = key === 'purple';
        const prevSection = attSectionSelector.value;
        attSectionSelector.innerHTML = '';
        const opts = isEquipos
          ? [['takers','TAKERS'],['makers','MAKERS']]
          : [['rj','RJ'],['takers','TAKERS'],['makers','MAKERS']];
        opts.forEach(([v,t]) => {
          const o = document.createElement('option'); o.value = v; o.text = t;
          if (v === prevSection) o.selected = true;
          attSectionSelector.appendChild(o);
        });
        if (isEquipos && !['takers','makers'].includes(attSectionSelector.value)) {
          attSectionSelector.value = 'takers';
        }
        syncOptWheelLabelForSelect(attSectionSelector);

        if (rerender) {
          const newSection = attSectionSelector.value;
          if (newSection !== attState.section) {
            attSaveLeaderForWeek();
            attState.section = newSection;
            attApplySectionLabels();
          }
          attUpdateLeaderDropdown();
        }
      };

      const attApplySectionLabels = () => {
        const sec = ATT_SECTIONS[attState.section];
        attActiveSectionLabel.textContent = sec.label;
        attActiveVisitLabel.textContent = sec.visitLabel;
        const col2 = attState.section === 'makers' ? 'Culto' : 'Red';
        attThCelMain.textContent = 'Célula';
        attThRedMain.textContent = col2;
        attThCelVisit.textContent = 'Célula';
        attThRedVisit.textContent = col2;
        attLblCel.textContent = 'Total Célula:';
        attLblRed.textContent = `Total ${col2}:`;
      };

      // ---- Filas ----
      const attAddRow = (tbody, isNewCol, nameValue = '', celChecked = false, redChecked = false, newChecked = false) => {
        const tr = document.createElement('tr');
        let html = `
          <td><button class="dc-att__btn-del" type="button">✕</button></td>
          <td><input type="text" class="in-n" placeholder="Nombre" value="${nameValue}"/></td>
          <td class="check-col"><input type="checkbox" class="chk-cel" ${celChecked ? 'checked' : ''}></td>
          <td class="check-col"><input type="checkbox" class="chk-red" ${redChecked ? 'checked' : ''}></td>
        `;
        if (isNewCol) html += `<td class="check-col"><input type="checkbox" class="chk-new" ${newChecked ? 'checked' : ''}></td>`;
        tr.innerHTML = html;
        qs('.dc-att__btn-del', tr).addEventListener('click', () => {
          tr.remove();
          attUpdateCounts();
          attSaveLeaderForWeek();
          setDcDirty(true);
        });
        tbody.appendChild(tr);
        return tr;
      };

      const attRenderSection = (tbody, rows, isNew) => {
        tbody.innerHTML = '';
        if (rows && rows.length > 0) {
          rows.forEach(r => attAddRow(tbody, isNew, r.name || '', !!r.cel, !!r.red, !!r.new));
        } else {
          for (let i = 0; i < 3; i++) attAddRow(tbody, isNew);
        }
      };

      const attGetSectionData = (tbody, hasNewCol) => {
        return qsa('tr', tbody).map(tr => ({
          name: qs('.in-n', tr)?.value || '',
          cel:  !!qs('.chk-cel', tr)?.checked,
          red:  !!qs('.chk-red', tr)?.checked,
          new:  hasNewCol ? !!qs('.chk-new', tr)?.checked : false,
        }));
      };

      // ---- Conteos ----
      const attUpdateCounts = () => {
        let visitCel = 0, visitRed = 0;
        qsa('tr', attVisitBody).forEach(tr => {
          const isNew = qs('.chk-new', tr)?.checked;
          if (!isNew) {
            if (qs('.chk-cel', tr)?.checked) visitCel++;
            if (qs('.chk-red', tr)?.checked) visitRed++;
          }
        });
        const cel = qsa('.chk-cel:checked', attMainBody).length + visitCel;
        const red = qsa('.chk-red:checked', attMainBody).length + visitRed;
        const nw  = qsa('.chk-new:checked', attVisitBody).length;

        attSummaryTitle.textContent = `RESUMEN TOTAL ASISTENCIA — ${ATT_SECTIONS[attState.section].label}`;
        attSumCel.textContent = cel;
        attSumRed.textContent = red;
        if (nw > 0) { attSumNuevos.textContent = nw; attSumNuevosRow.style.display = 'block'; }
        else { attSumNuevosRow.style.display = 'none'; }
      };

      const attCalculateOffering = () => {
        const sinpe = parseFloat(attOffSinpe.value) || 0;
        const efectivo = parseFloat(attOffEfectivo.value) || 0;
        attTotalOffering.textContent = (sinpe + efectivo).toLocaleString('es-CR');
      };

      // ---- Dropdown de líderes ----
      const attUpdateLeaderDropdownSilent = (color, section, leaderValue) => {
        const names = (ATT_LIDERES[color] && ATT_LIDERES[color][section]) ? ATT_LIDERES[color][section] : [];
        attLeaderName.innerHTML = '<option value="">— Seleccionar Líder —</option>';
        names.forEach(n => {
          const opt = document.createElement('option');
          opt.value = n; opt.text = n;
          if (n === leaderValue) opt.selected = true;
          attLeaderName.appendChild(opt);
        });
        if (color === 'purple' && names.length === 1) attLeaderName.value = names[0];
        syncOptWheelLabelForSelect(attLeaderName);
      };

      const attUpdateLeaderDropdown = () => {
        const prev = attLeaderName.value;
        attUpdateLeaderDropdownSilent(attColorSelector.value, attState.section, prev);
        attOnLeaderChange();
      };

      const attOnLeaderChange = () => {
        // Guardar lo que había en pantalla bajo el líder anterior antes de cambiar.
        if (attState.currentLeaderKey) {
          attSaveLeaderForWeek();
        }
        const newKey = attGetLeaderKey();
        attState.currentLeaderKey = newKey;
        attLoadLeaderForWeek(newKey);
        attRenderSection(attMainBody, attState.sections[attState.section].main, false);
        attRenderSection(attVisitBody, attState.sections[attState.section].visit, true);
        attUpdateCounts();
        attLoadOffering();
      };

      // ---- Copiar ----
      const attCopyText = (text, msg) => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        alert(msg);
      };

      const attFormatRows = (rows, hasNew) => {
        const col2Label = attState.section === 'makers' ? 'Culto' : 'Red';
        let out = ''; let idx = 1;
        rows.forEach(r => {
          if (r.name && r.name.trim()) {
            const cel = r.cel ? '✅' : '❌';
            const red = r.red ? '✅' : '❌';
            const nFlag = (hasNew && r.new) ? ' | 🌟 Nuevo' : '';
            out += `${idx}. ${r.name.trim()} | Célula: ${cel} | ${col2Label}: ${red}${nFlag}\n`;
            idx++;
          }
        });
        return out;
      };
      const attCountFromRows = (rows, key) => rows.filter(r => r[key]).length;

      const attSortTableAlphabetically = (tbody) => {
        const rows = qsa('tr', tbody);
        rows.sort((a, b) => {
          const nameA = (qs('.in-n', a)?.value || '').trim().toLowerCase();
          const nameB = (qs('.in-n', b)?.value || '').trim().toLowerCase();
          if (!nameA) return 1;
          if (!nameB) return -1;
          return nameA.localeCompare(nameB, 'es');
        });
        rows.forEach(r => tbody.appendChild(r));
      };

      attCopyTodoBtn.addEventListener('click', () => {
        if (!attLeaderName.value) { alert('⚠️ Debes seleccionar el nombre del líder antes de copiar.'); return; }

        attSortTableAlphabetically(attMainBody);
        attSortTableAlphabetically(attVisitBody);
        attSaveLeaderForWeek();

        const week = attCurrentWeek();
        const weekLabel = `Semana ${week}`;
        const dateStr = weekRangeLabel(week);
        const sec = ATT_SECTIONS[attState.section];
        const main = attGetSectionData(attMainBody, false);
        const visit = attGetSectionData(attVisitBody, true);

        const isEquipos = attColorSelector.value === 'purple';
        const secName = isEquipos ? 'EQUIPOS' : sec.label;
        let text = `*${weekLabel}* (${dateStr})\n*LÍDER (${secName}): ${attLeaderName.value.toUpperCase()}*\n\n`;

        const mainRows = attFormatRows(main, false);
        const visitRows = attFormatRows(visit, true);
        if (mainRows) text += `*--- ${sec.copyLabel} ---*\n${mainRows}\n`;
        if (visitRows) text += `*--- ${sec.copyVisitLabel} ---*\n${visitRows}\n`;

        const visitNoNew = visit.filter(r => !r.new);
        const cel = attCountFromRows(main, 'cel') + attCountFromRows(visitNoNew, 'cel');
        const red = attCountFromRows(main, 'red') + attCountFromRows(visitNoNew, 'red');
        const nw  = attCountFromRows(visit, 'new');

        const col2Label = attState.section === 'makers' ? 'Culto' : 'Red';
        text += `*RESUMEN TOTAL ASISTENCIA*\n`;
        text += `Total ${sec.copyLabel} Célula: ${cel}\n`;
        text += `Total ${sec.copyLabel} ${col2Label}: ${red}`;
        if (nw > 0) text += `\n*NUEVOS:* ${sec.copyLabel}: ${nw}`;

        const sinpe = attOffSinpe.value;
        const efectivo = attOffEfectivo.value;
        if (sinpe || efectivo) {
          const total = (parseFloat(sinpe)||0) + (parseFloat(efectivo)||0);
          text += `\n\n*--- OFRENDAS ---*\n`;
          if (sinpe) text += `Sinpe: ₡${sinpe}\n`;
          if (efectivo) text += `Efectivo: ₡${efectivo}\n`;
          text += `*Total: ₡${total.toLocaleString('es-CR')}*`;
        }
        attCopyText(text, '¡Copiado!');
      });

      attCopyOfrendasBtn.addEventListener('click', () => {
        const week = attCurrentWeek();
        const weekLabel = `Semana ${week}`;
        const dateStr = weekRangeLabel(week);
        const sinpe = attOffSinpe.value;
        const efectivo = attOffEfectivo.value;
        if (!sinpe && !efectivo) { alert('No hay datos de ofrenda para copiar.'); return; }
        const total = (parseFloat(sinpe)||0) + (parseFloat(efectivo)||0);
        const isEquipos = attColorSelector.value === 'purple';
        const secName = isEquipos ? 'EQUIPOS' : ATT_SECTIONS[attState.section].label;
        let text = `*${weekLabel}* (${dateStr})\n*LÍDER (${secName}): ${(attLeaderName.value||'').toUpperCase()}*\n\n`;
        text += `*--- OFRENDAS ---*\n`;
        if (sinpe) text += `Sinpe: ₡${sinpe}\n`;
        if (efectivo) text += `Efectivo: ₡${efectivo}\n`;
        text += `*Total: ₡${total.toLocaleString('es-CR')}*`;
        attCopyText(text, '¡Ofrendas copiadas!');
      });

      // ---- Listeners ----
      attColorSelector.addEventListener('change', () => { attApplyColor(true); setDcDirty(true); });
      attSectionSelector.addEventListener('change', () => {
        attSaveLeaderForWeek();
        attState.section = attSectionSelector.value;
        attApplySectionLabels();
        attUpdateLeaderDropdown();
        setDcDirty(true);
      });
      attLeaderName.addEventListener('change', () => { attOnLeaderChange(); setDcDirty(true); });

      attOffSinpe.addEventListener('input', () => { attCalculateOffering(); attSaveOffering(); setDcDirty(true); });
      attOffEfectivo.addEventListener('input', () => { attCalculateOffering(); attSaveOffering(); setDcDirty(true); });

      attAddMain.addEventListener('click', () => { attAddRow(attMainBody, false); attUpdateCounts(); attSaveLeaderForWeek(); setDcDirty(true); });
      attAddVisit.addEventListener('click', () => { attAddRow(attVisitBody, true); attUpdateCounts(); attSaveLeaderForWeek(); setDcDirty(true); });

      // Delegado: cualquier edición dentro de las tablas del widget guarda y marca "dirty".
      attRoot.addEventListener('input', (e) => {
        if (e.target.closest('.dc-att__table')) { attUpdateCounts(); attSaveLeaderForWeek(); }
      });
      attRoot.addEventListener('change', (e) => {
        if (e.target.closest('.dc-att__table')) { attUpdateCounts(); attSaveLeaderForWeek(); }
      });

      // ---- Init (una sola vez) ----
      attApplySectionLabels();
      attApplyColor(false);

      // ---- Refresco al abrir/cambiar de semana (llamado desde openDinamicaCelular) ----
      attRefreshForWeek = () => {
        attApplyColor(false);
        attApplySectionLabels();
        attUpdateLeaderDropdown();
      };
    })();

    const openDinamicaCelular = () => {
      if (!state.selectedWeek) {
        alert('Primero selecciona una semana.');
        return;
      }
      if (dcSheetTitle) dcSheetTitle.textContent = `Dinámica Celular • Semana ${state.selectedWeek} (${weekRangeLabel(state.selectedWeek)})`;
      if (dcStatus) dcStatus.textContent = '';

      // Cargar borrador local (si existe)
      const draft = getWeekDraft(state.selectedWeek).dc;
      setSheetVisible(true);
      if (draft) {
        applyDcDraft(draft);
      } else {
        // Defaults solo si NO hay borrador: precarga el lunes real de la semana seleccionada
        // (antes usaba la fecha de hoy, sin relación con la semana elegida).
        if (dcDate && !dcDate.value) dcDate.value = weekMondayISO(state.selectedWeek);
        initDcDefaults();
      }
      rebuildJustNames();
      attRefreshForWeek();
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    // Cierra cada hoja y vuelve a la pantalla de semana (usadas por el botón único Atrás)
    const closeDcSheet = async () => {
      if (!(await confirmLeaveNotesSheet())) return;
      setWeekScreenVisible(true);
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    const closeWeekSheet = async () => {
      if (!(await confirmLeaveNotesSheet())) return;
      hideAllNoteSheets();
      setWeekScreenVisible(true);
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    const markSaved = (statusEl) => {
      if (!statusEl) return;
      const t = new Date().toLocaleString();
      statusEl.textContent = `Guardado local: ${t} (pendiente Supabase)`;
    };

    const openTakersSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      takersSheetTitle && (takersSheetTitle.textContent = `Takers • Semana ${state.selectedWeek}`);
      takersMeta && (takersMeta.textContent = fmtWeekdayNote(getWeekWeekday(state.selectedWeek, 5)));
      takersStatus && (takersStatus.textContent = '');
      setDateIfEmpty(takersDate);
      const draft = getWeekDraft(state.selectedWeek).takers;
      if (draft) applyRteDraft(draft, takersTema, takersDate, takersNotes);
      showNoteSheet(notesSheetTakers);
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    const openCultosSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      cultosSheetTitle && (cultosSheetTitle.textContent = `Cultos • Semana ${state.selectedWeek}`);
      cultosMeta && (cultosMeta.textContent = fmtWeekdayNote(getWeekWeekday(state.selectedWeek, 6)));
      cultosStatus && (cultosStatus.textContent = '');
      setDateIfEmpty(cultosDate);
      const draft = getWeekDraft(state.selectedWeek).cultos;
      if (draft) applyRteDraft(draft, cultosTema, cultosDate, cultosNotes);
      showNoteSheet(notesSheetCultos);
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    const openLideresSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      lideresSheetTitle && (lideresSheetTitle.textContent = `Reunión de Líderes/Ministerios • Semana ${state.selectedWeek}`);
      lideresMeta && (lideresMeta.textContent = fmtWeekdayNote(getWeekWeekday(state.selectedWeek, 0)));
      lideresStatus && (lideresStatus.textContent = '');
      setDateIfEmpty(lideresDate);
      const draft = getWeekDraft(state.selectedWeek).lideres;
      if (draft) applyRteDraft(draft, lideresTema, lideresDate, lideresNotes);
      showNoteSheet(notesSheetLideres);
      updateNotesCrumb();
      updateNotesHeaderActions();
    };

    

    const shareText = async (text) => {
      const payload = { text };
      try {
        if (navigator.share) {
          await navigator.share(payload);
          return;
        }
      } catch {}
      try {
        await navigator.clipboard.writeText(text);
        alert('Contenido copiado al portapapeles.');
      } catch {
        alert('No se pudo compartir/copiar automáticamente en este navegador.');
      }
    };

    const buildShare = (title, temaEl, dateEl, editorEl) => {
      const week = state.selectedWeek ? `Semana ${state.selectedWeek}` : '';
      const tema = temaEl?.value ? `Tema: ${temaEl.value}` : '';
      const fecha = dateEl?.value ? `Fecha: ${dateEl.value}` : '';
      const body = editorEl ? (editorEl.innerText || '').trim() : '';
      return [title, week, tema, fecha, "", body].filter(Boolean).join("\n");
    };

    // Acciones del botón único "Atrás" según la hoja abierta (o vuelta al selector de semanas)
    const NOTES_BACK_ACTIONS = {
      dc: closeDcSheet,
      takers: closeWeekSheet,
      cultos: closeWeekSheet,
      lideres: closeWeekSheet,
    };

    // Acciones del botón único "Compartir" según la hoja abierta (Dinámica Celular no comparte)
    const NOTES_SHARE_ACTIONS = {
      takers: () => shareText(buildShare('Takers', takersTema, takersDate, takersNotes)),
      cultos: () => shareText(buildShare('Cultos', cultosTema, cultosDate, cultosNotes)),
      lideres: () => shareText(buildShare('Reunión de Líderes/Ministerios', lideresTema, lideresDate, lideresNotes)),
    };

    notesBtnBack?.addEventListener('click', async () => {
      const action = state.notesOpenSheet ? NOTES_BACK_ACTIONS[state.notesOpenSheet] : null;
      if (action) { await action(); return; }
      if (state.selectedWeek) await backToWeekPicker();
    });

    notesBtnShare?.addEventListener('click', () => {
      const action = NOTES_SHARE_ACTIONS[state.notesOpenSheet];
      if (action) action();
    });

    notesBtnSave?.addEventListener('click', () => {
      saveNotesNow();
    });

btnNoteDinamica?.addEventListener('click', openDinamicaCelular);
    btnNoteTakers?.addEventListener('click', openTakersSheet);
    btnNoteCultos?.addEventListener('click', openCultosSheet);
      btnNoteLideres?.addEventListener('click', openLideresSheet);

    // ---- Init
    populateWeeks();
    setWeekScreenVisible(false);
    showView('home');

    // ---- Editor RTE (Takers / Cultos / Reunión de Líderes)
    // Menú flotante de formato: aparece al seleccionar texto dentro de cualquier .rte__editor,
    // en vez de una barra fija (optimiza espacio). Permite Negrita, Subrayado, 5 colores de
    // resaltado predefinidos, y "−" para quitar el resaltado de la selección.
    const RTE_HIGHLIGHT_COLORS = [
      { hex: '#FFE066', label: 'Amarillo' },
      { hex: '#8FE3A0', label: 'Verde' },
      { hex: '#7FD8EF', label: 'Celeste' },
      { hex: '#FFC48C', label: 'Durazno' },
      { hex: '#F3A6D2', label: 'Rosa' },
    ];
    // Color de texto fijo y oscuro para que siempre se lea sobre los pasteles del resaltado,
    // sin importar el tema (claro/oscuro) de la app.
    const RTE_HIGHLIGHT_TEXT_COLOR = '#2B2B2B';

    const initRTE = () => {
      const bar = document.createElement('div');
      bar.className = 'rte-float-toolbar is-hidden';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Formato de texto');
      bar.innerHTML = `
        <button class="rte-float-toolbar__btn" type="button" data-cmd="bold" title="Negrita"><strong>N</strong></button>
        <button class="rte-float-toolbar__btn" type="button" data-cmd="underline" title="Subrayado"><u>S</u></button>
        <span class="rte-float-toolbar__sep" aria-hidden="true"></span>
        <button class="rte-float-toolbar__btn" type="button" data-clear-highlight="true" title="Quitar resaltado"><i class="fa-solid fa-minus"></i></button>
        ${RTE_HIGHLIGHT_COLORS.map(c => `<button class="rte-float-toolbar__dot" type="button" data-highlight="${c.hex}" style="--dot-color:${c.hex}" title="Resaltar ${c.label}" aria-label="Resaltar ${c.label}"></button>`).join('')}
      `;
      document.body.appendChild(bar);

      let activeEditor = null;

      const hideBar = () => {
        bar.classList.add('is-hidden');
        activeEditor = null;
      };

      const positionBar = (rect) => {
        const barRect = bar.getBoundingClientRect();
        const margin = 8;
        let top = rect.top - barRect.height - margin;
        let left = rect.left + (rect.width / 2) - (barRect.width / 2);
        if (top < 8) top = rect.bottom + margin; // si no cabe arriba, se muestra debajo
        left = Math.max(8, Math.min(left, window.innerWidth - barRect.width - 8));
        bar.style.top = `${top}px`;
        bar.style.left = `${left}px`;
      };

      const updateBar = () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hideBar(); return; }

        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const node = container.nodeType === 1 ? container : container.parentElement;
        const editor = node ? node.closest('.rte__editor') : null;
        if (!editor) { hideBar(); return; }

        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) { hideBar(); return; }

        activeEditor = editor;
        bar.classList.remove('is-hidden');
        positionBar(rect);
      };

      document.addEventListener('mouseup', (e) => {
        if (e.target.closest('.rte-float-toolbar')) return;
        setTimeout(updateBar, 0);
      });
      document.addEventListener('keyup', (e) => {
        if (!e.target.closest('.rte__editor')) return;
        updateBar();
      });
      document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) hideBar();
      });
      window.addEventListener('scroll', () => hideBar(), true);
      window.addEventListener('resize', hideBar);

      // Evita que el mousedown sobre el menú le quite el foco/selección al editor
      bar.addEventListener('mousedown', (e) => e.preventDefault());

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn || !activeEditor) return;

        const editor = activeEditor;
        editor.focus();
        try { document.execCommand('styleWithCSS', false, true); } catch {}

        const cmd = btn.dataset.cmd;
        const highlight = btn.dataset.highlight;
        const clearHighlight = btn.dataset.clearHighlight;

        if (cmd) {
          try { document.execCommand(cmd, false, null); } catch {}
        } else if (highlight) {
          try { document.execCommand('hiliteColor', false, highlight); }
          catch { try { document.execCommand('backColor', false, highlight); } catch {} }
          try { document.execCommand('foreColor', false, RTE_HIGHLIGHT_TEXT_COLOR); } catch {}
        } else if (clearHighlight) {
          const themeColor = getComputedStyle(editor).color;
          try { document.execCommand('hiliteColor', false, 'transparent'); }
          catch { try { document.execCommand('backColor', false, 'transparent'); } catch {} }
          try { document.execCommand('foreColor', false, themeColor); } catch {}
        }

        updateBar();
      });
    };

    initRTE();

    // ---- Mis Doce: tabla tipo excel (solo UI; persistencia luego con Supabase)
    const misDoceBody = qs('#misDoceBody');
    const btnMdAddRow = qs('#btnMdAddRow');
    const btnMdRemoveRow = qs('#btnMdRemoveRow');

    const mdFormatDdMm = (raw) => {
      const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
      if (digits.length <= 2) return digits;
      return digits.slice(0,2) + '/' + digits.slice(2);
    };

    const mdFormatPhone = (raw) => {
      const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
      if (digits.length <= 4) return digits;
      return digits.slice(0,4) + '-' + digits.slice(4);
    };

    const mdClearRow = (tr) => {
      if (!tr) return;
      qsa('input[type="text"]', tr).forEach(inp => { inp.value = ''; });
      qsa('input[type="checkbox"]', tr).forEach(chk => { chk.checked = false; });
      const sel = qs('select', tr);
      if (sel) sel.value = 'N/A';
    };

    const mdAddRow = () => {
      if (!misDoceBody) return;
      const tpl = qs('tr', misDoceBody);
      if (!tpl) return;
      const tr = tpl.cloneNode(true);
      mdClearRow(tr);
      misDoceBody.appendChild(tr);
    };

    const mdRemoveRow = () => {
      if (!misDoceBody) return;
      const rows = qsa('tr', misDoceBody);
      if (rows.length <= 1) return;
      rows[rows.length - 1].remove();
    };

    btnMdAddRow?.addEventListener('click', mdAddRow);
    btnMdRemoveRow?.addEventListener('click', mdRemoveRow);

    // Formateo en vivo (delegación)
    misDoceBody?.addEventListener('input', (e) => {
      const bday = e.target.closest('.md-bday');
      if (bday) {
        const next = mdFormatDdMm(bday.value);
        if (bday.value !== next) bday.value = next;
        return;
      }
      const phone = e.target.closest('.md-phone');
      if (phone) {
        const next = mdFormatPhone(phone.value);
        if (phone.value !== next) phone.value = next;
        return;
      }
    });

    // Defaults: tabla arranca con 4 filas (HTML). Si quedara en blanco por cambios futuros, garantiza 4.
    (() => {
      if (!misDoceBody) return;
      const rows = qsa('tr', misDoceBody);
      if (rows.length) return;
      for (let i=0; i<4; i++) mdAddRow();
    })();


  })();
})();
