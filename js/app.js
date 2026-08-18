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
      materialFolderId: null,
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

    // Cerrar el sidebar en móvil al hacer click fuera (backdrop)
    const sidebarBackdrop = qs('#sidebarBackdrop');
    sidebarBackdrop?.addEventListener('click', () => {
      shell.classList.remove('is-sidebar-open');
    });

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

    // Estado visual del botón único Atrás/Guardar: si la hoja abierta tiene cambios sin guardar,
    // el botón se muestra como "Guardar" (icono disquete + resaltado); si no, como "Volver".
    const updateSaveButtonState = () => {
      if (!notesBtnBack) return;
      const dirty = !!state.notesOpenSheet && isCurrentSheetDirty();
      notesBtnBack.classList.toggle('is-save-mode', dirty);
      notesBtnBack.innerHTML = dirty
        ? '<i class="fa-solid fa-floppy-disk"></i>'
        : '<i class="fa-solid fa-circle-left"></i>';
      const label = dirty ? 'Guardar' : 'Volver';
      notesBtnBack.setAttribute('aria-label', label);
      notesBtnBack.title = label;
    };

    const updateNotesHeaderActions = () => {
      if (!notesHeaderActions) return;
      const showBack = !!state.selectedWeek;
      notesHeaderActions.classList.toggle('is-hidden', !showBack);
      if (notesBtnShare) {
        const showShare = NOTES_SHEETS_WITH_SHARE.includes(state.notesOpenSheet);
        notesBtnShare.classList.toggle('is-hidden', !showShare);
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

    // Modal de aviso para Asistencia (botones TODO/Ofrendas): mismo estilo
    // que notesLeaveModal, pero de un solo botón "Aceptar".
    const attInfoModal = qs('#attInfoModal');
    const attInfoModalBody = qs('#attInfoModalBody');
    const attInfoModalOk = qs('#attInfoModalOk');
    const showAttInfoModal = (msg) => {
      if (!attInfoModal || !attInfoModalBody) { alert(msg); return; }
      attInfoModalBody.textContent = msg;
      attInfoModal.classList.remove('is-hidden');
    };
    const closeAttInfoModal = () => { attInfoModal?.classList.add('is-hidden'); };
    attInfoModalOk?.addEventListener('click', closeAttInfoModal);
    attInfoModal?.addEventListener('click', (e) => { if (e.target === attInfoModal) closeAttInfoModal(); });

    const showView = (view) => {
      state.view = view;
      qsa('.view').forEach(v => v.classList.remove('is-visible'));
      const section = qs(`#view-${view}`);
      section?.classList.add('is-visible');

      // Carga diferida de apps embebidas (Yadá): solo se pide el archivo
      // la primera vez que el usuario entra a esa vista.
      const embedFrame = section?.querySelector('iframe[data-src]');
      if (embedFrame && !embedFrame.getAttribute('src')) {
        embedFrame.addEventListener('load', () => {
          const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
          try {
            embedFrame.contentWindow?.postMessage(
              { action: 'setTheme', theme },
              window.location.origin
            );
          } catch {}
        }, { once: true });
        embedFrame.setAttribute('src', embedFrame.dataset.src);
      }

      setActiveNav(view);
      if (view === 'notas') { updateNotesCrumb(); updateNotesHeaderActions(); }
      closeSidebarOnMobile();

      if (view === 'anuncios') {
        // Carga/refresh de las actividades al entrar en la vista
        loadAnuncios();
      }

      if (view === 'calendario') {
        loadCalendarioPosts();
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
        syncAllJustWheels(); // refleja en los wheels móviles los radios recién cargados
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

    // ---- Gesto "atrás" del sistema (Android/iOS) vía History API
    // Estrategia: retraceo literal del camino recorrido (como las flechas
    // atrás/adelante de cualquier navegador). Cada clic que cambia de
    // pantalla (cambiar de vista, elegir semana, abrir/cerrar una hoja de
    // Notas, entrar/salir de una carpeta en Material) empuja SU propia
    // entrada al historial EN EL MOMENTO DEL CLIC — nunca de forma reactiva
    // dentro de un evento popstate (eso es lo que falla con el gesto de
    // navegación predictiva de Android). El gesto atrás simplemente restaura
    // la pantalla anterior tal cual, un paso a la vez, hasta llegar a Inicio;
    // desde Inicio, un back adicional sale de la app con normalidad.
    let isRestoring = false;

    const pushScreen = (descriptor) => {
      if (isRestoring) return; // estamos reproduciendo un popstate: no volver a empujar
      try { history.pushState(descriptor, ''); } catch (e) {}
    };

    const navigate = async (view, opts = {}) => {
      if (!(await confirmLeaveNotesSheet())) return;
      const { push = true } = opts;
      if (push && state.view && state.view !== view) {
        state.history.push(state.view);
      }
      showView(view);
      pushScreen({ view });
    };

    const goBack = async () => {
      if (!(await confirmLeaveNotesSheet())) return;
      const prev = state.history.pop();
      if (prev) showView(prev);
      else showView('home');
    };


    qsa('.nav-btn[data-view]').forEach(btn => {
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
    const anuncioContainer = qs('#anuncioContainer');
    const anuncioStatus = qs('#anuncioStatus');
    let anuncioRowsCache = [];

    // Ordena la tabla de Anuncios: activos primero (los más próximos primero),
    // vencidos (fecha < hoy) al final (el más recientemente vencido arriba
    // dentro de ese grupo). Ver .ann-row--expired para el tachado visual.
    const sortAnuncioActivities = (rows) => {
      const todayStr = todayISO();
      const active = [];
      const expired = [];
      (rows || []).forEach(r => {
        if (r.event_date && r.event_date < todayStr) expired.push(r);
        else active.push(r);
      });
      active.sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
      expired.sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));
      return [...active, ...expired];
    };

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

    // División actual del usuario (según profiles). Reutiliza el mismo cache
    // que getRole(); requiere que getRole()/getDivision() se haya llamado al
    // menos una vez para poblar cachedProfile.
    const getDivision = async () => {
      if (!cachedProfile) {
        try {
          cachedProfile = normalizeProfile(await getMyProfile(supabase, user.id));
        } catch {
          cachedProfile = null;
        }
      }
      return (cachedProfile && cachedProfile.division) ? String(cachedProfile.division) : null;
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

    const reviewSquadTitle = qs('#reviewSquadTitle');
    const reviewSquadSelect = qs('#reviewSquadSelect');
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
	        .select('id, full_name, role, division')
	        .in('id', ids)
	        .eq('role', 'user')
	        .eq('active', true)
	        .neq('id', user.id)
	        .order('full_name', { ascending: true });
	      if (res.error) return [];
	      return (res.data || []).filter(Boolean);
	    };

	    // Admin ve TODO: Lider_de_Escuadron + Lider_de_Célula activos.
	    // squadCode opcional: filtra usando leader_squads (dueño del escuadrón)
	    // y user_squads (sus líderes de célula). Cubierto por profiles_select_admin_all.
	    const loadAllActiveUsersForAdmin = async (squadCode) => {
	      let allowedIds = null;
	      if (squadCode) {
	        const [leadersRes, usersRes] = await Promise.all([
	          supabase.from('leader_squads').select('leader_id').eq('squad_code', squadCode),
	          supabase.from('user_squads').select('user_id').eq('squad_code', squadCode),
	        ]);
	        const ids = [
	          ...((leadersRes.data || []).map(r => r.leader_id)),
	          ...((usersRes.data || []).map(r => r.user_id)),
	        ].filter(Boolean);
	        allowedIds = Array.from(new Set(ids));
	        if (!allowedIds.length) return [];
	      }

	      let q = supabase
	        .from('profiles')
	        .select('id, full_name, role, division')
	        .in('role', ['leader', 'user'])
	        .eq('active', true)
	        .neq('id', user.id)
	        .order('full_name', { ascending: true });
	      if (allowedIds) q = q.in('id', allowedIds);

	      const res = await q;
	      if (res.error) return [];
	      return (res.data || []).filter(Boolean);
	    };

	    // Lider_de_Escuadron primero (alfabético), luego Lider_de_Célula (alfabético).
	    const sortReviewUsers = (users) => {
	      const rank = (r) => (r === 'leader' ? 0 : 1);
	      return [...users].sort((a, b) => {
	        const ra = rank(a.role), rb = rank(b.role);
	        if (ra !== rb) return ra - rb;
	        return (a.full_name || '').localeCompare(b.full_name || '', 'es');
	      });
	    };

	    const renderReviewUserOptions = (users) => {
	      reviewUserSelect.innerHTML = '<option value="">Selecciona…</option>';
	      const sorted = sortReviewUsers(users);
	      const hasLeaders = sorted.some(u => u.role === 'leader');
	      const hasUsers = sorted.some(u => u.role === 'user');
	      const mixed = hasLeaders && hasUsers;

	      const groupLeaders = mixed ? document.createElement('optgroup') : null;
	      const groupUsers = mixed ? document.createElement('optgroup') : null;
	      if (groupLeaders) groupLeaders.label = 'Líderes de Escuadrón';
	      if (groupUsers) groupUsers.label = 'Líderes de Célula';
	      if (groupLeaders) reviewUserSelect.appendChild(groupLeaders);

	      sorted.forEach(u => {
	        const opt = document.createElement('option');
	        opt.value = u.id;
	        opt.textContent = u.full_name || u.id;
	        opt.dataset.division = u.division || '';
	        if (mixed && u.role === 'leader') groupLeaders.appendChild(opt);
	        else if (mixed && u.role === 'user') groupUsers.appendChild(opt);
	        else reviewUserSelect.appendChild(opt);
	      });

	      if (groupUsers && groupUsers.childElementCount) reviewUserSelect.appendChild(groupUsers);
	    };

    const loadReviewUsers = async () => {
      if (!reviewUserSelect) return;
      reviewUserSelect.innerHTML = '<option value="">Cargando…</option>';
      setReviewStatus('Cargando usuarios…');

      const role = await getRole();
      const users = (role === 'admin')
        ? await loadAllActiveUsersForAdmin(reviewSquadSelect?.value || '')
        : await loadProfilesByIds(await loadUsersInSquads(await loadLeaderSquadCodes()));

      renderReviewUserOptions(users);

      const emptyMsg = (role === 'admin') ? 'No hay usuarios registrados.' : 'No tienes usuarios asignados.';
      setReviewStatus(users.length ? '' : emptyMsg);
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
      const selectedOpt = id ? reviewUserSelect.selectedOptions?.[0] : null;
      reviewState.userName = selectedOpt ? (selectedOpt.textContent || null) : null;
      reviewState.week = null;
      resetReviewWeekUI();
      paintReviewWeekTiles();

      // Ocultar el pill "Takers" al revisar a un líder/usuario de división
      // Makers (Takers no aplica a esa división). Sin selección, se muestra
      // por defecto.
      const reviewedDivision = selectedOpt ? (selectedOpt.dataset.division || '') : '';
      btnReviewTakers?.classList.toggle('is-hidden', reviewedDivision === 'makers');

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

    // Mostrar acceso "Revisión de Notas" solo a Líder de Escuadrón y Admin del App
    (async () => {
      try {
        const role = await getRole();
        if (role === 'leader' || role === 'admin') {
          navReviewNotes?.classList.remove('is-hidden');
          cardReviewNotes?.classList.remove('is-hidden');
        }
      } catch {}
    })();

    // Ocultar la hoja "Takers" en Notas propias a Líder de Célula y Líder de
    // Escuadrón cuando su división es Makers (Takers solo aplica a división
    // Takers). Admin del App no se filtra por división aquí.
    (async () => {
      try {
        const role = await getRole();
        const division = await getDivision();
        if ((role === 'leader' || role === 'user') && division === 'makers') {
          const btnNoteTakersEl = qs('#btnNoteTakers');
          btnNoteTakersEl?.classList.add('is-hidden');
        }
      } catch {}
    })();

    // El filtro de Escuadrón solo aplica a admin (un leader ya solo ve su propio
    // escuadrón por RLS/scope). El listener se registra una sola vez.
    reviewSquadSelect?.addEventListener('change', () => {
      loadReviewUsers();
    });

    const initReviewView = async () => {
      try {
        const role = await getRole();
        if (role !== 'leader' && role !== 'admin') {
          setReviewStatus('Solo disponible para líderes y administradores.');
          return;
        }
        const isAdminRole = (role === 'admin');
        reviewSquadTitle?.classList.toggle('is-hidden', !isAdminRole);
        reviewSquadSelect?.classList.toggle('is-hidden', !isAdminRole);

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
    const calendarioList = qs('#calendarioList');

    const renderCalendarioList = (rows) => {
      if (!calendarioList) return;
      const data = Array.isArray(rows) ? rows : [];
      if (!data.length) {
        calendarioList.innerHTML = '<div class="muted">No hay anuncios.</div>';
        return;
      }

      calendarioList.innerHTML = data.map(r => {
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
            '<div style="display:flex;gap:8px;align-items:center;">'
              + '<a class="pill pill--icon" href="' + safeUrl + '" download title="Descargar" aria-label="Descargar">'
                + '<i class="fa-solid fa-file-arrow-down"></i></a>'
              + '<button type="button" class="pill pill--icon" data-share-title="' + title + '" data-share-url="' + safeUrl + '" title="Compartir" aria-label="Compartir">'
                + '<i class="fa-solid fa-share-from-square"></i></button>'
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

    const loadCalendarioPosts = async () => {
      if (!calendarioList) return;
      calendarioList.textContent = 'Cargando…';

      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, image_url, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        calendarioList.innerHTML = '<div class="msg err">' + escapeHtml(error.message) + '</div>';
        return;
      }

      renderCalendarioList(data);
    };


    // ---- Material de apoyo (tabla materials + Storage bucket materials)
    // Carpetas: tabla `material_folders` en Supabase (paso 3).
    // `materials.folder_id` referencia esa tabla (null = raíz).

    const supportGrid = qs('#supportGrid');
    const materialBreadcrumbEl = qs('#materialBreadcrumb');
    let materialRowsCache = [];
    let materialFoldersCache = [];

    const MATERIAL_TYPE_ICON = {
      folder:        'fa-solid fa-folder',
      folder_open:   'fa-solid fa-folder-open',
      word:          'fa-solid fa-file-word',
      image:         'fa-solid fa-image',
      pdf:           'fa-solid fa-file-pdf',
      ppt:           'fa-solid fa-file-powerpoint',
    };

    // Detección de plataforma para el ícono del enlace (aparte del archivo,
    // o como ícono principal cuando el material es solo un enlace).
    const MATERIAL_LINK_ICON_RULES = [
      { re: /spotify\.com/i,            icon: 'fa-brands fa-spotify' },
      { re: /youtube\.com|youtu\.be/i,  icon: 'fa-brands fa-youtube' },
      { re: /tiktok\.com/i,             icon: 'fa-brands fa-tiktok' },
      { re: /wa\.me|whatsapp\.com/i,    icon: 'fa-brands fa-whatsapp' },
      { re: /facebook\.com|fb\.watch/i, icon: 'fa-brands fa-facebook' },
      { re: /instagram\.com/i,          icon: 'fa-brands fa-instagram' },
    ];
    const inferMaterialLinkIcon = (url) => {
      const u = String(url || '');
      const rule = MATERIAL_LINK_ICON_RULES.find(r => r.re.test(u));
      return rule ? rule.icon : 'fa-solid fa-link';
    };

    const getMaterialFolderById = (id) => materialFoldersCache.find(f => f.id === id) || null;
    const getMaterialFolderChildren = (parentId) =>
      materialFoldersCache.filter(f => (f.parent_id || null) === (parentId || null));
    const getMaterialFolderPath = (id) => {
      const path = [];
      let cur = id ? getMaterialFolderById(id) : null;
      while (cur) {
        path.unshift(cur);
        cur = cur.parent_id ? getMaterialFolderById(cur.parent_id) : null;
      }
      return path;
    };
    // Deriva el tipo de ÍCONO DE ARCHIVO (solo aplica cuando el material
    // tiene archivo; el enlace se resuelve aparte con inferMaterialLinkIcon).
    const inferMaterialType = (row) => {
      const url = row.image_url || '';
      const name = (row.file_name || url || '').toLowerCase();
      if (/\.pdf(\?|$)/.test(name)) return 'pdf';
      if (/\.(docx?|rtf)(\?|$)/.test(name)) return 'word';
      if (/\.(pptx?|key)(\?|$)/.test(name)) return 'ppt';
      if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(name)) return 'image';
      return 'image';
    };
    // Un material puede tener archivo, enlace, o ambos a la vez. `link_url`
    // es la columna dedicada al enlace; se conserva compatibilidad con
    // filas antiguas que guardaban el enlace directamente en `image_url`
    // (cuando no tenían archivo).
    const materialHasFile = (r) => !!(r && r.file_name && r.image_url);
    const materialEffectiveLink = (r) => {
      if (!r) return '';
      if (r.link_url) return r.link_url;
      if (!r.file_name && r.image_url && /^https?:\/\//i.test(r.image_url)) return r.image_url;
      return '';
    };

    const renderMaterialBreadcrumb = () => {
      if (!materialBreadcrumbEl) return;
      const path = getMaterialFolderPath(state.materialFolderId);
      // El botón raíz "Material" solo se muestra cuando ya estás dentro de
      // una carpeta (sirve para volver). En la raíz no aporta nada, así
      // que se omite para no dejar un indicador estático sin uso.
      let html = path.length
        ? '<button type="button" class="material-crumb" data-folder-id="">'
            + '<i class="fa-solid fa-folder-open"></i> Principal</button>'
        : '';
      path.forEach((f, i) => {
        const isCurrent = i === path.length - 1;
        html += (html ? '<span class="material-crumb-sep">/</span>' : '')
          + '<button type="button" class="material-crumb' + (isCurrent ? ' is-current' : '') + '" data-folder-id="' + escapeHtml(f.id) + '">'
          + escapeHtml(f.name) + '</button>';
      });
      materialBreadcrumbEl.innerHTML = html;
    };

    materialBreadcrumbEl?.addEventListener('click', (e) => {
      const btn = e.target.closest('.material-crumb');
      if (!btn) return;
      const id = btn.dataset.folderId || null;
      if (id === (state.materialFolderId || null)) return;
      state.materialFolderId = id || null;
      renderMaterials(materialRowsCache);
      pushScreen({ view: 'material', folderId: state.materialFolderId });
    });

    const buildFolderCardHtml = (f) => (
      '<button type="button" class="material-card material-card--folder" data-open-folder="' + escapeHtml(f.id) + '">'
        + '<span class="material-icon"><i class="' + MATERIAL_TYPE_ICON.folder + '"></i></span>'
        + '<span class="material-name">' + escapeHtml(f.name) + '</span>'
      + '</button>'
    );

    const buildItemCardHtml = (r) => {
      const title = escapeHtml(r.title || 'Material');
      const url = r.image_url || '';
      const safeUrl = escapeHtml(url);
      const hasFile = materialHasFile(r);
      const link = materialEffectiveLink(r);
      const safeLink = escapeHtml(link);

      const iconClass = hasFile
        ? (MATERIAL_TYPE_ICON[inferMaterialType(r)] || MATERIAL_TYPE_ICON.image)
        : inferMaterialLinkIcon(link);

      // Click principal: si hay archivo, abre el archivo (aunque también
      // tenga enlace, ese queda como chip aparte). Si es solo enlace,
      // el ícono y el nombre abren el enlace.
      const primaryHref = hasFile ? safeUrl : safeLink;
      const iconEl = primaryHref
        ? '<a class="material-card__link" href="' + primaryHref + '" target="_blank" rel="noopener"><span class="material-icon"><i class="' + iconClass + '"></i></span></a>'
        : '<span class="material-card__link"><span class="material-icon"><i class="' + iconClass + '"></i></span></span>';
      const nameEl = primaryHref
        ? '<a class="material-name" href="' + primaryHref + '" target="_blank" rel="noopener">' + title + '</a>'
        : '<span class="material-name">' + title + '</span>';

      // Descargar y Compartir siempre están presentes; si la acción no
      // aplica a este material, el ícono queda atenuado e inerte.
      const downloadEl = hasFile
        ? '<a class="pill pill--icon" href="' + safeUrl + '" download title="Descargar" aria-label="Descargar"><i class="fa-solid fa-file-arrow-down"></i></a>'
        : '<span class="pill pill--icon is-disabled" aria-disabled="true" title="No disponible (sin archivo)"><i class="fa-solid fa-file-arrow-down"></i></span>';

      const shareUrl = hasFile ? safeUrl : safeLink;
      const shareEl = shareUrl
        ? '<button type="button" class="pill pill--icon" data-share-title="' + title + '" data-share-url="' + shareUrl + '" title="Compartir" aria-label="Compartir">'
            + '<i class="fa-solid fa-share-from-square"></i></button>'
        : '<span class="pill pill--icon is-disabled" aria-disabled="true" title="No disponible"><i class="fa-solid fa-share-from-square"></i></span>';

      // Chip extra del enlace: solo aparece cuando el material tiene archivo Y enlace a la vez.
      const linkChip = (hasFile && link)
        ? '<a class="pill pill--icon" href="' + safeLink + '" target="_blank" rel="noopener" title="Abrir enlace" aria-label="Abrir enlace"><i class="' + inferMaterialLinkIcon(link) + '"></i></a>'
        : '';

      return (
        '<div class="material-card material-card--item">'
          + iconEl
          + '<div class="material-card__info">'
            + nameEl
            + '<div class="material-actions">' + downloadEl + shareEl + linkChip + '</div>'
          + '</div>'
        + '</div>'
      );
    };

    const byNameAsc = (a, b) => String(a.__sortName || '').localeCompare(String(b.__sortName || ''), 'es', { sensitivity: 'base' });

    // Divisiones fijas, en este orden. Si una división queda vacía, ni su
    // título ni su grilla se muestran.
    const renderMaterialSections = (folders, itemsHere) => {
      const sections = [];

      const foldersSorted = [...folders].sort((a, b) => byNameAsc({ __sortName: a.name }, { __sortName: b.name }));
      if (foldersSorted.length) {
        sections.push({ title: 'Carpetas', html: foldersSorted.map(buildFolderCardHtml).join('') });
      }

      const groups = { pdf: [], word: [], ppt: [], image: [], link: [] };
      itemsHere.forEach(r => {
        const hasFile = materialHasFile(r);
        if (hasFile) {
          const t = inferMaterialType(r);
          (groups[t] || groups.image).push(r);
        } else if (materialEffectiveLink(r)) {
          groups.link.push(r);
        }
      });

      const GROUP_DEFS = [
        { key: 'pdf',   title: 'PDF' },
        { key: 'word',  title: 'WORD' },
        { key: 'ppt',   title: 'Presentaciones' },
        { key: 'image', title: 'Imagenes' },
        { key: 'link',  title: 'Enlaces' },
      ];

      GROUP_DEFS.forEach(({ key, title }) => {
        const list = groups[key];
        if (!list || !list.length) return;
        const sorted = [...list].sort((a, b) => byNameAsc({ __sortName: a.title || '' }, { __sortName: b.title || '' }));
        sections.push({ title, html: sorted.map(buildItemCardHtml).join('') });
      });

      return sections.map(s =>
        '<div class="material-section-title" style="grid-column:1 / -1;">' + escapeHtml(s.title) + '</div>' + s.html
      ).join('');
    };

    const renderMaterials = (rows) => {
      if (!supportGrid) return;
      renderMaterialBreadcrumb();

      const folders = getMaterialFolderChildren(state.materialFolderId);
      const data = Array.isArray(rows) ? rows : [];
      const itemsHere = data.filter(r => (r.folder_id || null) === (state.materialFolderId || null));

      if (!folders.length && !itemsHere.length) {
        supportGrid.innerHTML = '<div class="muted">No hay material de apoyo en esta carpeta.</div>';
        return;
      }

      supportGrid.innerHTML = renderMaterialSections(folders, itemsHere);
    };

    supportGrid?.addEventListener('click', (e) => {
      const folderBtn = e.target.closest('[data-open-folder]');
      if (!folderBtn) return;
      state.materialFolderId = folderBtn.dataset.openFolder;
      renderMaterials(materialRowsCache);
      pushScreen({ view: 'material', folderId: state.materialFolderId });
    });

    const loadMaterials = async () => {
      if (!supportGrid) return;
      supportGrid.textContent = 'Cargando…';

      const [foldersRes, materialsRes] = await Promise.all([
        supabase
          .from('material_folders')
          .select('id, name, parent_id')
          .order('name', { ascending: true }),
        supabase
          .from('materials')
          .select('id, title, image_url, file_name, link_url, created_at, folder_id')
          .order('created_at', { ascending: false }),
      ]);

      // Carpetas y materiales se procesan por separado: un error en una
      // consulta no debe ocultar los resultados válidos de la otra.
      materialFoldersCache = foldersRes.error ? [] : (Array.isArray(foldersRes.data) ? foldersRes.data : []);
      materialRowsCache = materialsRes.error ? [] : (Array.isArray(materialsRes.data) ? materialsRes.data : []);
      state.materialFolderId = null;

      if (foldersRes.error) {
        supportGrid.innerHTML = '<div class="msg err">' + escapeHtml(foldersRes.error.message) + '</div>';
        return;
      }
      if (materialsRes.error) {
        renderMaterials(materialRowsCache);
        supportGrid.insertAdjacentHTML('beforeend', '<div class="msg err">' + escapeHtml(materialsRes.error.message) + '</div>');
        return;
      }

      renderMaterials(materialRowsCache);
    };


    const fmtInvestment = (v) => {
      if (v == null || v === '') return '';
      const n = Number(v);
      if (Number.isNaN(n)) return String(v);
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Rango (ISO YYYY-MM-DD) lunes–domingo de la semana actual, para resaltar
    // en la tabla de Anuncios los registros cuya fecha caiga dentro de ella
    // (mismo criterio de "semana actual" que usa Notas — ver getCurrentWeekNumber).
    const anuncioCurrentWeekRangeISO = () => {
      const weekNum = getCurrentWeekNumber();
      if (!weekNum) return null;
      const { monday, sunday } = getWeekRange(weekNum);
      return { mondayISO: monday.toISOString().slice(0, 10), sundayISO: sunday.toISOString().slice(0, 10) };
    };

    const renderAnuncioTable = (rows, isAdmin) => {
      if (!anuncioContainer) return;

      const headCells = [
        '<th>Actividad</th>',
        '<th>Fecha</th>',
        '<th>Encargado</th>',
        '<th>#Contacto</th>',
        '<th>Inversión</th>',
        '<th class="ann-actions">Acciones</th>',
      ];

      const curRange = anuncioCurrentWeekRangeISO();
      const todayStr = todayISO();

      const body = (rows || []).map(r => {
        const inCurrentWeek = !!(curRange && r.event_date && r.event_date >= curRange.mondayISO && r.event_date <= curRange.sundayISO);
        const isExpired = !!(r.event_date && r.event_date < todayStr);
        const cells = [
          `<td>${escapeHtml(r.activity)}</td>`,
          `<td>${escapeHtml(r.event_date)}</td>`,
          `<td>${escapeHtml(r.owner_name)}</td>`,
          `<td>${escapeHtml(r.contact_phone)}</td>`,
          `<td>${escapeHtml(fmtInvestment(r.investment))}</td>`,
          `<td class="ann-actions">` +
            `<button type="button" class="pill pill--icon" data-ann-share="${escapeHtml(r.id)}" title="Compartir" aria-label="Compartir">` +
              `<i class="fa-solid fa-share-from-square"></i></button>` +
          `</td>`,
        ];
        const rowClasses = [
          inCurrentWeek ? 'ann-row--current' : '',
          isExpired ? 'ann-row--expired' : '',
        ].filter(Boolean).join(' ');
        const rowClassAttr = rowClasses ? ` class="${rowClasses}"` : '';
        return `<tr${rowClassAttr}>${cells.join('')}</tr>`;
      }).join('');

      anuncioContainer.innerHTML = `
        <table class="table ann-table" id="anuncioTable">
          <thead><tr>${headCells.join('')}</tr></thead>
          <tbody id="anuncioBody">${body || ''}</tbody>
        </table>
      `;
    };

    const loadAnuncios = async () => {
      if (!anuncioContainer) return;

      setStatus(anuncioStatus, 'Cargando…');

      const role = await getRole();
      const isAdmin = role === 'admin';

      const { data, error } = await supabase
        .from('calendar_activities')
        .select('*')
        .order('event_date', { ascending: true });

      if (error) {
        setStatus(anuncioStatus, 'Error cargando calendario.');
        anuncioContainer.textContent = 'No se pudo cargar.';
        return;
      }

      anuncioRowsCache = sortAnuncioActivities(data || []);
      renderAnuncioTable(anuncioRowsCache, isAdmin);
      setStatus(anuncioStatus, '');
    };

    const buildAnuncioShare = (r) => {
      const lines = [
        r.activity ? `Actividad: ${r.activity}` : '',
        r.event_date ? `Fecha: ${r.event_date}` : '',
        r.owner_name ? `Encargado: ${r.owner_name}` : '',
        r.contact_phone ? `Contacto: ${r.contact_phone}` : '',
        (r.investment !== null && r.investment !== undefined && r.investment !== '')
          ? `Inversión: ${fmtInvestment(r.investment)}` : '',
      ];
      return lines.filter(Boolean).join('\n');
    };

    anuncioContainer?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ann-share]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-ann-share');
      const row = anuncioRowsCache.find(r => String(r.id) === String(id));
      if (!row) return;
      shareText(buildAnuncioShare(row));
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

    const cultoAudioAdminBox = qs('#cultoAudioAdminBox');
    const cultoAudioUrlInput = qs('#cultoAudioUrlInput');
    const btnCultoAudioSave = qs('#btnCultoAudioSave');
    const cultoAudioAdminStatus = qs('#cultoAudioAdminStatus');
    const cultoAudioPlayer = qs('#cultoAudioPlayer');
    const cultoAudioEl = qs('#cultoAudioEl');
    const btnCultoAudioPlay = qs('#btnCultoAudioPlay');
    const cultoAudioPlayIcon = qs('#cultoAudioPlayIcon');
    const btnCultoAudioBack = qs('#btnCultoAudioBack');
    const btnCultoAudioForward = qs('#btnCultoAudioForward');
    const cultoAudioTime = qs('#cultoAudioTime');
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

    // Semanas propias marcadas como "supervisadas" por un líder/admin.
    // A diferencia de `completed` (local), esto sí viene de Supabase
    // (note_reviews), gracias a la policy note_reviews_select_own.
    const myWeeksReviewed = {};

    const loadMyWeeksReviewedMap = async () => {
      const res = await supabase
        .from('note_reviews')
        .select('week, review_done')
        .eq('user_id', user.id)
        .eq('review_done', true);
      if (res.error) return;
      (res.data || []).forEach(r => {
        if (r && r.week != null) myWeeksReviewed[String(r.week)] = true;
      });
      qsa('.week', weeksGrid).forEach(w => markWeekTile(Number(w.dataset.week)));
    };

    const setWeekScreenVisible = (visible) => {
      notesWeekPicker.classList.toggle('is-hidden', visible);
      notesWeekScreen.classList.toggle('is-hidden', !visible);
      if (notesSheetScreen) notesSheetScreen.classList.add('is-hidden');
      state.dcOpen = false;
      state.notesOpenSheet = null;
      updateNotesFullHeightMode();
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
      updateNotesFullHeightMode();
    };

    // Marca <body> cuando una hoja de texto libre (Takers/Cultos/Líderes) está abierta,
    // para que esa hoja pueda ocupar el alto disponible con scroll interno (ver CSS .notes-fullheight).
    const NOTES_FULLHEIGHT_SHEETS = ['takers', 'cultos', 'lideres'];
    const updateNotesFullHeightMode = () => {
      document.body.classList.toggle('notes-fullheight', NOTES_FULLHEIGHT_SHEETS.includes(state.notesOpenSheet));
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
      updateNotesFullHeightMode();
      pushScreen({ view: 'notas', week: state.selectedWeek, sheet: state.notesOpenSheet });
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
      tile.classList.toggle('is-current', weekNum === getCurrentWeekNumber());
      tile.classList.toggle('is-reviewed', !!myWeeksReviewed[String(weekNum)]);
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
      pushScreen({ view: 'notas', week: weekNum });

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
      pushScreen({ view: 'notas' });
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

    // Número de semana (1–52) cuyo rango lunes–domingo contiene la fecha de
    // hoy, para resaltar la semana ACTUAL en el calendario de Notas
    // (ver .week.is-current). null si hoy cae fuera del rango de 52 semanas.
    const getCurrentWeekNumber = (year = new Date().getFullYear()) => {
      const todayStr = todayISO();
      for (let i = 1; i <= 52; i++) {
        const { monday, sunday } = getWeekRange(i, year);
        const mondayStr = monday.toISOString().slice(0, 10);
        const sundayStr = sunday.toISOString().slice(0, 10);
        if (todayStr >= mondayStr && todayStr <= sundayStr) return i;
      }
      return null;
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
      // Alcance global (document): este wheel también se usa en Mis Doce (Cumpleaños DD/MM),
      // fuera de #notesSheetScreen, así que no puede limitarse a ese contenedor.
      qsa('.dc-wheel__panel', document).forEach(panel => {
        if (panel === exceptPanel) return;
        panel.classList.add('is-hidden');
      });
    };

    const setDcWheelActiveOption = (wheelEl, idx) => {
      qsa('.dc-wheel__option', wheelEl).forEach(opt => {
        opt.classList.toggle('is-active', Number(opt.dataset.val) === idx);
      });
    };

    // Rango numérico de cada wheel: por defecto 0-60 (tarjetas de Dinámica Celular);
    // un wheel puede definir su propio rango vía data-min/data-max (p.ej. Mis Doce: DD 1-31, MM 1-12).
    const getDcWheelRange = (wheelEl) => {
      const min = parseInt(wheelEl.dataset.min, 10);
      const max = parseInt(wheelEl.dataset.max, 10);
      return {
        min: Number.isFinite(min) ? min : DC_WHEEL_MIN,
        max: Number.isFinite(max) ? max : DC_WHEEL_MAX,
      };
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
      const { min, max } = getDcWheelRange(wheelEl);
      const frag = document.createDocumentFragment();
      for (let i = min; i <= max; i++) {
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

      const { min, max } = getDcWheelRange(wheelEl);
      const ref = parseInt(wheelEl.dataset.ref, 10) || min;
      const hasValue = valueInput.value !== '';
      const parsed = parseInt(valueInput.value, 10);
      const idx = Math.min(max, Math.max(min, hasValue && !isNaN(parsed) ? parsed : ref));

      list.scrollTop = (idx - min) * DC_WHEEL_ITEM_H;
      setDcWheelActiveOption(wheelEl, idx);
    };

    const initDcWheels = () => {
      // Alcance global (document): incluye tanto las tarjetas de Dinámica Celular
      // como los wheels de Cumpleaños (DD/MM) en Mis Doce.
      qsa('.dc-wheel', document).forEach(wheelEl => {
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
        const { min: rMin, max: rMax } = getDcWheelRange(wheelEl);
        let scrollTimer = null;
        list.addEventListener('scroll', () => {
          const liveIdx = Math.min(rMax, Math.max(rMin, rMin + Math.round(list.scrollTop / DC_WHEEL_ITEM_H)));
          setDcWheelActiveOption(wheelEl, liveIdx);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const settledIdx = Math.min(rMax, Math.max(rMin, rMin + Math.round(list.scrollTop / DC_WHEEL_ITEM_H)));
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

    // ---- Wheel de "Justificó" (Seguimiento, solo móvil) — lista fija Sí/No,
    // mismo patrón visual/scroll-snap que .dc-optwheel (reutiliza sus clases
    // __value/__panel/__marker/__list/__option vía CSS), pero SIN <select>:
    // el wheel lee y escribe directamente sobre los radios reales
    // (input[name="dcJust${n}"]) que ya existen en la fila, así
    // collectDcDraft/applyDcDraft siguen intactos — el wheel es solo la
    // representación visual en móvil. ----
    const JUST_WHEEL_ITEM_H = 36; // debe coincidir con .dc-optwheel__option { height:36px }

    const closeAllJustWheels = (exceptPanel) => {
      qsa('.dc-justwheel .dc-optwheel__panel', notesSheetScreen || document).forEach(panel => {
        if (panel === exceptPanel) return;
        panel.classList.add('is-hidden');
      });
    };

    const getJustRadios = (wheelEl) => {
      const tr = wheelEl.closest('tr');
      if (!tr) return { yes: null, no: null };
      return {
        yes: qs('input[type="radio"][value="si"]', tr),
        no: qs('input[type="radio"][value="no"]', tr),
      };
    };

    // Refleja en el input visible el radio actualmente marcado. Se usa al
    // inicializar y también hay que llamarla después de que applyDcDraft
    // marque los radios al cargar datos guardados (ver más abajo).
    const syncJustWheelLabel = (wheelEl) => {
      const valueInput = qs('.dc-optwheel__value', wheelEl);
      if (!valueInput) return;
      const { yes, no } = getJustRadios(wheelEl);
      valueInput.value = yes?.checked ? 'Sí' : (no?.checked ? 'No' : '');
    };

    const syncAllJustWheels = () => {
      qsa('.dc-justwheel', notesSheetScreen || document).forEach(syncJustWheelLabel);
    };

    const openJustWheelPanel = (wheelEl) => {
      const panel = qs('.dc-optwheel__panel', wheelEl);
      const list = qs('.dc-optwheel__list', wheelEl);
      if (!panel || !list) return;

      closeAllDcWheels();
      closeAllNameWheels();
      closeAllOptWheels();
      closeAllJustWheels(panel);
      panel.classList.remove('is-hidden');

      const { yes, no } = getJustRadios(wheelEl);
      const idx = yes?.checked ? 0 : (no?.checked ? 1 : 0);
      list.scrollTop = idx * JUST_WHEEL_ITEM_H;
      setOptWheelActiveOption(wheelEl, idx);
    };

    // Confirma la opción `idx` (0=Sí, 1=No): marca el radio real correspondiente
    // y dispara 'change' sobre él, igual que si el usuario hubiera tocado el
    // checkbox directamente.
    const commitJustWheelValue = (wheelEl, idx) => {
      const { yes, no } = getJustRadios(wheelEl);
      if (!yes || !no) return;
      const val = idx === 0 ? 'si' : 'no';
      const target = val === 'si' ? yes : no;
      const changed = !target.checked;
      yes.checked = val === 'si';
      no.checked = val === 'no';
      syncJustWheelLabel(wheelEl);
      if (changed) target.dispatchEvent(new Event('change', { bubbles: true }));
      setDcDirty(true);
    };

    const initJustWheels = () => {
      qsa('.dc-justwheel', notesSheetScreen || document).forEach(wheelEl => {
        if (wheelEl.dataset.wheelInit === '1') return;
        wheelEl.dataset.wheelInit = '1';

        const valueInput = qs('.dc-optwheel__value', wheelEl);
        const list = qs('.dc-optwheel__list', wheelEl);
        const panel = qs('.dc-optwheel__panel', wheelEl);
        if (!valueInput || !list || !panel) return;

        syncJustWheelLabel(wheelEl);

        valueInput.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = !panel.classList.contains('is-hidden');
          if (isOpen) panel.classList.add('is-hidden');
          else openJustWheelPanel(wheelEl);
        });

        let scrollTimer = null;
        const clampIdx = (raw) => Math.min(1, Math.max(0, raw));
        list.addEventListener('scroll', () => {
          const liveIdx = clampIdx(Math.round(list.scrollTop / JUST_WHEEL_ITEM_H));
          setOptWheelActiveOption(wheelEl, liveIdx);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const settledIdx = clampIdx(Math.round(list.scrollTop / JUST_WHEEL_ITEM_H));
            commitJustWheelValue(wheelEl, settledIdx);
          }, 140);
        });

        list.addEventListener('click', (e) => {
          const opt = e.target.closest('.dc-optwheel__option');
          if (!opt) return;
          commitJustWheelValue(wheelEl, Number(opt.dataset.idx));
          panel.classList.add('is-hidden');
        });
      });
    };

    // Cierra cualquier panel abierto al hacer click fuera o presionar Escape.
    document.addEventListener('click', (e) => {
      if (!notesSheetScreen) return;
      if (e.target.closest && (e.target.closest('.dc-wheel') || e.target.closest('.dc-namewheel') || e.target.closest('.dc-optwheel') || e.target.closest('.dc-justwheel'))) return;
      closeAllDcWheels();
      closeAllNameWheels();
      closeAllOptWheels();
      closeAllJustWheels();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeAllDcWheels(); closeAllNameWheels(); closeAllOptWheels(); closeAllJustWheels(); }
    });

    initDcWheels();
    initNameWheels();
    initSelectWheels();
    initJustWheels();

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
            <input class="input dc-namewheel__value" type="text" readonly placeholder="Ausente" value=""/>
            <div class="dc-namewheel__panel is-hidden">
              <div class="dc-namewheel__marker"></div>
              <div class="dc-namewheel__list"></div>
            </div>
          </div>
        </td>
        <td>
          <div class="dc-namewheel">
            <input class="input dc-namewheel__value" type="text" readonly placeholder="Seguimiento" value=""/>
            <div class="dc-namewheel__panel is-hidden">
              <div class="dc-namewheel__marker"></div>
              <div class="dc-namewheel__list"></div>
            </div>
          </div>
        </td>
        <td class="dc-table__just">
          <div class="dc-just-radios">
            <label class="dc-just"><input name="dcJust${n}" type="radio" value="si"/> Sí</label>
            <label class="dc-just"><input name="dcJust${n}" type="radio" value="no"/> No</label>
          </div>
          <div class="dc-just-mobile">
            <div class="dc-just-mobile__box">
            <div class="dc-just-mobile__label">Justificó</div>
            <div class="dc-justwheel">
              <input class="input dc-optwheel__value" type="text" readonly placeholder="" value=""/>
              <div class="dc-optwheel__panel is-hidden">
                <div class="dc-optwheel__marker"></div>
                <div class="dc-optwheel__list">
                  <div class="dc-optwheel__option" data-idx="0">Sí</div>
                  <div class="dc-optwheel__option" data-idx="1">No</div>
                </div>
              </div>
            </div>
            </div>
          </div>
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
      initJustWheels(); // conecta el .dc-justwheel de la fila recién creada (idempotente)
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
        const celIconHtml = '<i class="fa-solid fa-house" title="Célula"></i>';
        const col2IconHtml = '<i class="fa-solid fa-cross" title="' + col2 + '"></i>';
        attThCelMain.innerHTML = celIconHtml;
        attThRedMain.innerHTML = col2IconHtml;
        attThCelVisit.innerHTML = celIconHtml;
        attThRedVisit.innerHTML = col2IconHtml;
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
        showAttInfoModal(msg);
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
        if (!attLeaderName.value) { showAttInfoModal('⚠️ Debes seleccionar el nombre del líder antes de copiar.'); return; }

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
        if (!sinpe && !efectivo) { showAttInfoModal('No hay datos de ofrenda para copiar.'); return; }
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
      pushScreen({ view: 'notas', week: state.selectedWeek });
    };

    const closeWeekSheet = async () => {
      if (!(await confirmLeaveNotesSheet())) return;
      hideAllNoteSheets();
      setWeekScreenVisible(true);
      updateNotesCrumb();
      updateNotesHeaderActions();
      pushScreen({ view: 'notas', week: state.selectedWeek });
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

    // ---- Audio del culto (Notas > Cultos): link público de R2, guardado por
    // admin en `culto_audio` (RLS: solo admin escribe, cualquier activo lee).
    const fmtCultoTime = (sec) => {
      if (!isFinite(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    };

    const updateCultoAudioTimeLabel = () => {
      if (!cultoAudioTime) return;
      cultoAudioTime.textContent = `${fmtCultoTime(cultoAudioEl.currentTime)} / ${fmtCultoTime(cultoAudioEl.duration)}`;
    };

    cultoAudioEl?.addEventListener('timeupdate', updateCultoAudioTimeLabel);
    cultoAudioEl?.addEventListener('loadedmetadata', updateCultoAudioTimeLabel);
    cultoAudioEl?.addEventListener('play', () => {
      if (cultoAudioPlayIcon) cultoAudioPlayIcon.className = 'fa-solid fa-pause';
    });
    cultoAudioEl?.addEventListener('pause', () => {
      if (cultoAudioPlayIcon) cultoAudioPlayIcon.className = 'fa-solid fa-play';
    });

    btnCultoAudioPlay?.addEventListener('click', () => {
      if (!cultoAudioEl?.src) return;
      if (cultoAudioEl.paused) cultoAudioEl.play(); else cultoAudioEl.pause();
    });
    btnCultoAudioBack?.addEventListener('click', () => {
      if (!cultoAudioEl?.src) return;
      cultoAudioEl.currentTime = Math.max(0, cultoAudioEl.currentTime - 15);
    });
    btnCultoAudioForward?.addEventListener('click', () => {
      if (!cultoAudioEl?.src) return;
      const dur = isFinite(cultoAudioEl.duration) ? cultoAudioEl.duration : Infinity;
      cultoAudioEl.currentTime = Math.min(dur, cultoAudioEl.currentTime + 15);
    });

    const loadCultoAudioForWeek = async (week) => {
      // Reset player al cambiar de semana
      if (cultoAudioEl) { cultoAudioEl.pause(); cultoAudioEl.removeAttribute('src'); cultoAudioEl.load(); }
      cultoAudioPlayer?.classList.add('is-hidden');
      if (cultoAudioPlayIcon) cultoAudioPlayIcon.className = 'fa-solid fa-play';
      if (cultoAudioTime) cultoAudioTime.textContent = '0:00 / 0:00';
      if (cultoAudioUrlInput) cultoAudioUrlInput.value = '';
      if (cultoAudioAdminStatus) cultoAudioAdminStatus.textContent = '';

      const role = await getRole();
      const isAdminRole = (role === 'admin');
      if (cultoAudioAdminBox) cultoAudioAdminBox.style.display = isAdminRole ? '' : 'none';

      const res = await supabase
        .from('culto_audio')
        .select('public_url')
        .eq('week', week)
        .maybeSingle();

      const url = res?.data?.public_url || '';
      if (url) {
        if (cultoAudioEl) cultoAudioEl.src = url;
        cultoAudioPlayer?.classList.remove('is-hidden');
        if (isAdminRole && cultoAudioUrlInput) cultoAudioUrlInput.value = url;
      }
    };

    btnCultoAudioSave?.addEventListener('click', async () => {
      if (!state.selectedWeek) return;
      const url = (cultoAudioUrlInput?.value || '').trim();
      if (!url) { setStatus(cultoAudioAdminStatus, 'Pegá un link antes de guardar.'); return; }
      if (!/^https:\/\//i.test(url)) { setStatus(cultoAudioAdminStatus, 'El link debe empezar con https://'); return; }

      setStatus(cultoAudioAdminStatus, 'Guardando…');
      const res = await supabase
        .from('culto_audio')
        .upsert({
          week: state.selectedWeek,
          public_url: url,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'week' });

      if (res.error) {
        setStatus(cultoAudioAdminStatus, 'No se pudo guardar. Intenta de nuevo.');
        return;
      }
      setStatus(cultoAudioAdminStatus, `Guardado: ${nowLabel()}`);
      await loadCultoAudioForWeek(state.selectedWeek);
    });

    const openCultosSheet = () => {
      if (!state.selectedWeek) { alert('Primero selecciona una semana.'); return; }
      cultosSheetTitle && (cultosSheetTitle.textContent = `Cultos • Semana ${state.selectedWeek}`);
      cultosMeta && (cultosMeta.textContent = fmtWeekdayNote(getWeekWeekday(state.selectedWeek, 6)));
      cultosStatus && (cultosStatus.textContent = '');
      setDateIfEmpty(cultosDate);
      const draft = getWeekDraft(state.selectedWeek).cultos;
      if (draft) applyRteDraft(draft, cultosTema, cultosDate, cultosNotes);
      loadCultoAudioForWeek(state.selectedWeek);
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

    // Compartir (Anuncios / Material de apoyo): delegación sobre el contenedor,
    // así cubre también las tarjetas que se re-renderizan al recargar datos.
    const handleShareCardClick = (e) => {
      const btn = e.target.closest('[data-share-url]');
      if (!btn) return;
      const title = btn.dataset.shareTitle || '';
      const url = btn.dataset.shareUrl || '';
      shareText([title, url].filter(Boolean).join('\n'));
    };
    calendarioList?.addEventListener('click', handleShareCardClick);
    supportGrid?.addEventListener('click', handleShareCardClick);

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

    // Botón único Atrás/Guardar: si la hoja abierta tiene cambios sin guardar, guarda
    // (y el botón vuelve a mostrarse como "Atrás"); si no hay nada pendiente, navega hacia atrás.
    notesBtnBack?.addEventListener('click', async () => {
      if (state.notesOpenSheet && isCurrentSheetDirty()) {
        saveNotesNow();
        return;
      }
      const action = state.notesOpenSheet ? NOTES_BACK_ACTIONS[state.notesOpenSheet] : null;
      if (action) { await action(); return; }
      if (state.selectedWeek) await backToWeekPicker();
    });

    notesBtnShare?.addEventListener('click', () => {
      const action = NOTES_SHARE_ACTIONS[state.notesOpenSheet];
      if (action) action();
    });

btnNoteDinamica?.addEventListener('click', openDinamicaCelular);
    btnNoteTakers?.addEventListener('click', openTakersSheet);
    btnNoteCultos?.addEventListener('click', openCultosSheet);
      btnNoteLideres?.addEventListener('click', openLideresSheet);

    // Restaura visualmente una pantalla exacta a partir del descriptor guardado
    // en el historial (ver pushScreen). Reutiliza las mismas funciones que usan
    // los botones en pantalla, así que el popup de "cambios sin guardar" y la
    // carga de borradores/datos siguen funcionando igual que al navegar a mano.
    const applyScreen = async (d) => {
      d = d || { view: 'home' };

      if (d.view === 'notas') {
        if (state.view !== 'notas') showView('notas');
        if (!d.week) {
          hideAllNoteSheets();
          setWeekScreenVisible(false);
          state.selectedWeek = null;
          qsa('.week', weeksGrid).forEach(w => w.classList.remove('is-selected'));
          updateMeta();
          updateNotesCrumb();
          updateNotesHeaderActions();
          return;
        }
        hideAllNoteSheets();
        selectWeek(d.week);
        const openers = {
          dc: openDinamicaCelular,
          takers: openTakersSheet,
          cultos: openCultosSheet,
          lideres: openLideresSheet,
        };
        if (d.sheet && openers[d.sheet]) openers[d.sheet]();
        return;
      }

      if (d.view === 'material') {
        if (state.view !== 'material') showView('material');
        state.materialFolderId = d.folderId || null;
        renderMaterials(materialRowsCache);
        return;
      }

      await navigate(d.view || 'home', { push: false });
    };

    // Gesto/click "atrás" del sistema: dispara popstate. Restauramos la pantalla
    // anterior tal cual quedó registrada (retraceo literal del camino recorrido,
    // como las flechas atrás de cualquier navegador), un paso a la vez, hasta
    // llegar a Inicio. No se empuja nada aquí (isRestoring evita que las
    // funciones reutilizadas vuelvan a hacer pushState).
    window.addEventListener('popstate', async (e) => {
      // Si hay cambios sin guardar en una hoja de Notas, primero el aviso
      // Guardar/Salir sin guardar (igual que los botones en pantalla).
      await confirmLeaveNotesSheet();

      isRestoring = true;
      try {
        await applyScreen(e.state);
      } finally {
        isRestoring = false;
      }
    });

    // ---- Init
    populateWeeks();
    loadMyWeeksReviewedMap();
    setWeekScreenVisible(false);
    showView('home');
    try { history.replaceState({ view: 'home' }, ''); } catch (e) {}

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
    const btnMdShareAll = qs('#btnMdShareAll');

    // ---- Wheel de DRC (solo visual en móvil) ------------------------------
    // Mismo look que .dc-optwheel ("Asistencia"), pero con su propia clase
    // (.dc-drcwheel) y su propia lógica: .dc-optwheel/.dc-justwheel están
    // scoped a #notesSheetScreen y "Mis Doce" vive en otra sección, así que
    // no puede reutilizar esas funciones. El <select class="md-drc"> real
    // sigue siendo la fuente de verdad — el wheel solo lo lee/escribe.
    const MD_DRC_OPTIONS = ['N/A', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const MD_DRC_ITEM_H = 36; // debe coincidir con .dc-optwheel__option { height:36px }

    const closeAllDrcWheels = (exceptPanel) => {
      qsa('.dc-drcwheel .dc-optwheel__panel', misDoceBody || document).forEach(panel => {
        if (panel === exceptPanel) return;
        panel.classList.add('is-hidden');
      });
    };

    const setDrcWheelActiveOption = (wheelEl, idx) => {
      qsa('.dc-optwheel__option', wheelEl).forEach(opt => {
        opt.classList.toggle('is-active', Number(opt.dataset.idx) === idx);
      });
    };

    // Refleja en el input visible del wheel el valor actual del <select> real.
    const syncDrcWheelLabel = (tr) => {
      if (!tr) return;
      const select = qs('.md-drc', tr);
      const wheelEl = qs('.dc-drcwheel', tr);
      if (!select || !wheelEl) return;
      const valueInput = qs('.dc-optwheel__value', wheelEl);
      if (valueInput) valueInput.value = select.value || 'N/A';
    };

    const openDrcWheelPanel = (wheelEl) => {
      const tr = wheelEl.closest('tr');
      const select = tr ? qs('.md-drc', tr) : null;
      const panel = qs('.dc-optwheel__panel', wheelEl);
      const list = qs('.dc-optwheel__list', wheelEl);
      if (!select || !panel || !list) return;

      closeAllDrcWheels(panel);
      panel.classList.remove('is-hidden');

      const idx = Math.max(0, MD_DRC_OPTIONS.indexOf(select.value));
      list.scrollTop = idx * MD_DRC_ITEM_H;
      setDrcWheelActiveOption(wheelEl, idx);
    };

    // Confirma la opción `idx`: escribe el valor en el <select> real y
    // dispara 'change' sobre él, igual que si el usuario lo hubiera elegido
    // directamente — así toda la lógica existente (mdUpdateZonaState, etc.)
    // sigue funcionando sin cambios.
    const commitDrcWheelValue = (wheelEl, idx) => {
      const tr = wheelEl.closest('tr');
      const select = tr ? qs('.md-drc', tr) : null;
      const val = MD_DRC_OPTIONS[idx];
      if (!select || val === undefined) return;
      const changed = select.value !== val;
      select.value = val;
      syncDrcWheelLabel(tr);
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const initDrcWheels = () => {
      qsa('.dc-drcwheel', misDoceBody || document).forEach(wheelEl => {
        if (wheelEl.dataset.wheelInit === '1') return;
        wheelEl.dataset.wheelInit = '1';

        const tr = wheelEl.closest('tr');
        const valueInput = qs('.dc-optwheel__value', wheelEl);
        const list = qs('.dc-optwheel__list', wheelEl);
        const panel = qs('.dc-optwheel__panel', wheelEl);
        if (!tr || !valueInput || !list || !panel) return;

        syncDrcWheelLabel(tr);

        valueInput.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = !panel.classList.contains('is-hidden');
          if (isOpen) panel.classList.add('is-hidden');
          else openDrcWheelPanel(wheelEl);
        });

        let scrollTimer = null;
        const clampIdx = (raw) => Math.min(MD_DRC_OPTIONS.length - 1, Math.max(0, raw));
        list.addEventListener('scroll', () => {
          const liveIdx = clampIdx(Math.round(list.scrollTop / MD_DRC_ITEM_H));
          setDrcWheelActiveOption(wheelEl, liveIdx);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => {
            const settledIdx = clampIdx(Math.round(list.scrollTop / MD_DRC_ITEM_H));
            commitDrcWheelValue(wheelEl, settledIdx);
          }, 140);
        });

        list.addEventListener('click', (e) => {
          const opt = e.target.closest('.dc-optwheel__option');
          if (!opt) return;
          commitDrcWheelValue(wheelEl, Number(opt.dataset.idx));
          panel.classList.add('is-hidden');
        });
      });
    };

    // Cierra el panel del wheel de DRC al tocar fuera o presionar Escape.
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.dc-drcwheel')) return;
      closeAllDrcWheels();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllDrcWheels();
    });

    // "Zona" solo se activa si DRC tiene un día asignado (distinto de N/A).
    // Aplica/quita el link de Waze en el botón: sin link = ícono apagado
    // (--muted), con link = acento del tema (misma paleta del resto de la
    // Bitácora, sin colores ajenos al ecosistema).
    const mdSetWazeLink = (btn, link) => {
      if (!btn) return;
      const clean = (link || '').trim();
      if (clean) {
        btn.dataset.link = clean;
        btn.classList.add('has-link');
        btn.title = 'Abrir zona en Waze';
      } else {
        delete btn.dataset.link;
        btn.classList.remove('has-link');
        btn.title = btn.disabled ? 'Agregar link de Waze' : 'Agregar link de Waze';
      }
    };

    const mdUpdateZonaState = (tr) => {
      if (!tr) return;
      const drc = qs('.md-drc', tr);
      const zona = qs('.md-zona', tr);
      const wazeBtn = qs('.md-waze-btn', tr);
      const shareBtn = qs('.md-share-btn', tr);
      if (!drc || !zona) return;
      const active = drc.value !== 'N/A';
      zona.disabled = !active;
      if (!active) zona.value = '';
      if (wazeBtn) {
        wazeBtn.disabled = !active;
        if (!active) mdSetWazeLink(wazeBtn, '');
      }
      if (shareBtn) shareBtn.disabled = !active;
      // En móvil, sin DRC asignado no tiene sentido reservar espacio para
      // Zona/Links: la tarjeta pasa de 3 a 2 líneas (ver CSS de la media
      // query ≤920px).
      tr.classList.toggle('md-row-zona-hidden', !active);
    };

    const mdClearRow = (tr) => {
      if (!tr) return;
      qsa('input[type="text"]', tr).forEach(inp => { inp.value = ''; });
      qsa('input[type="checkbox"]', tr).forEach(chk => { chk.checked = false; });
      const sel = qs('select', tr);
      if (sel) sel.value = 'N/A';
      syncDrcWheelLabel(tr);
      const wazeBtn = qs('.md-waze-btn', tr);
      if (wazeBtn) mdSetWazeLink(wazeBtn, '');
      mdUpdateZonaState(tr);
    };

    // Arma el texto de la ficha de la zona para compartir por WhatsApp.
    const mdBuildShareText = (tr) => {
      const name = (qs('.md-name', tr)?.value || '').trim() || 'Sin nombre';
      const drc = qs('.md-drc', tr);
      const dia = (drc && drc.value !== 'N/A') ? drc.value : 'No asignado';
      const zona = (qs('.md-zona', tr)?.value || '').trim() || 'Sin zona';
      const wazeBtn = qs('.md-waze-btn', tr);
      const link = wazeBtn?.dataset.link || 'Sin link registrado';
      return (
        `* Líder: "${name}"\n` +
        `* Día de reunión de Célula: "${dia}"\n` +
        `* Zona: "${zona}"\n` +
        `* Dirección: "${link}"`
      );
    };

    // Los wheels (.dc-wheel) clonados heredan el flag de inicialización y las
    // opciones ya construidas del template; hay que limpiarlos para que
    // initDcWheels() les enganche los listeners de nuevo desde cero.
    const mdResetClonedWheels = (tr) => {
      qsa('.dc-wheel', tr).forEach(w => { delete w.dataset.wheelInit; });
      qsa('.dc-wheel__list', tr).forEach(l => { l.innerHTML = ''; delete l.dataset.built; });
      qsa('.dc-drcwheel', tr).forEach(w => { delete w.dataset.wheelInit; });
    };

    const mdAddRow = () => {
      if (!misDoceBody) return;
      const tpl = qs('tr', misDoceBody);
      if (!tpl) return;
      const tr = tpl.cloneNode(true);
      mdClearRow(tr);
      mdResetClonedWheels(tr);
      misDoceBody.appendChild(tr);
      initDcWheels();
      initDrcWheels();
    };

    const mdRemoveRow = () => {
      if (!misDoceBody) return;
      const rows = qsa('tr', misDoceBody);
      if (rows.length <= 1) return;
      rows[rows.length - 1].remove();
    };

    btnMdAddRow?.addEventListener('click', mdAddRow);
    btnMdRemoveRow?.addEventListener('click', mdRemoveRow);

    // Activa/desactiva "Zona" según DRC (delegación, cubre filas añadidas dinámicamente)
    misDoceBody?.addEventListener('change', (e) => {
      const drc = e.target.closest('.md-drc');
      if (!drc) return;
      const tr = drc.closest('tr');
      mdUpdateZonaState(tr);
      syncDrcWheelLabel(tr);
    });

    // Botón de Waze en "Zona":
    //  - Tap corto sin link  -> abre el modal para pegar el link (ícono cambia de color al guardar).
    //  - Tap corto con link  -> abre esa zona en Waze en pestaña nueva.
    //  - Mantener presionado -> abre el modal para editar o quitar el link (funciona con mouse y touch).
    let mdWazePressTimer = null;
    let mdWazeLongPressFired = false;

    // Modal de link de Waze: mismo patrón que el resto de los popups de la
    // Bitácora (modal-overlay/modal-box), en vez de window.prompt del navegador.
    const mdWazeModal = qs('#mdWazeModal');
    const mdWazeInput = qs('#mdWazeInput');
    const mdWazeSaveBtn = qs('#mdWazeSave');
    const mdWazeRemoveBtn = qs('#mdWazeRemove');
    const mdWazeCancelBtn = qs('#mdWazeCancel');
    let mdWazeActiveBtn = null;

    const closeMdWazeModal = () => {
      mdWazeModal?.classList.add('is-hidden');
      mdWazeActiveBtn = null;
    };

    const openMdWazeModal = (btn) => {
      if (!mdWazeModal || !mdWazeInput) return;
      mdWazeActiveBtn = btn;
      mdWazeInput.value = btn.dataset.link || '';
      mdWazeModal.classList.remove('is-hidden');
      mdWazeInput.focus();
    };

    mdWazeSaveBtn?.addEventListener('click', () => {
      if (!mdWazeActiveBtn) { closeMdWazeModal(); return; }
      mdSetWazeLink(mdWazeActiveBtn, mdWazeInput?.value || '');
      closeMdWazeModal();
    });
    mdWazeRemoveBtn?.addEventListener('click', () => {
      if (!mdWazeActiveBtn) { closeMdWazeModal(); return; }
      mdSetWazeLink(mdWazeActiveBtn, '');
      closeMdWazeModal();
    });
    mdWazeCancelBtn?.addEventListener('click', closeMdWazeModal);
    mdWazeModal?.addEventListener('click', (e) => { if (e.target === mdWazeModal) closeMdWazeModal(); });
    mdWazeInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); mdWazeSaveBtn?.click(); }
    });

    misDoceBody?.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.md-waze-btn');
      if (!btn || btn.disabled) return;
      mdWazeLongPressFired = false;
      clearTimeout(mdWazePressTimer);
      mdWazePressTimer = setTimeout(() => {
        mdWazeLongPressFired = true;
        openMdWazeModal(btn);
      }, 550);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
      misDoceBody?.addEventListener(evt, () => clearTimeout(mdWazePressTimer));
    });

    misDoceBody?.addEventListener('click', (e) => {
      const btn = e.target.closest('.md-waze-btn');
      if (!btn || btn.disabled) return;
      if (mdWazeLongPressFired) { mdWazeLongPressFired = false; return; } // ya se resolvió como long-press

      const current = btn.dataset.link || '';
      if (current) {
        window.open(current, '_blank', 'noopener');
      } else {
        openMdWazeModal(btn);
      }
    });

    // Botón de compartir: copia la ficha de la zona al portapapeles y abre
    // WhatsApp con ese mismo texto precargado (wa.me sin número = elegir contacto).
    misDoceBody?.addEventListener('click', async (e) => {
      const shareBtn = e.target.closest('.md-share-btn');
      if (!shareBtn || shareBtn.disabled) return;

      const tr = shareBtn.closest('tr');
      if (!tr) return;
      const text = mdBuildShareText(tr);

      try { await navigator.clipboard.writeText(text); } catch {}
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    });

    // Compartir general: junta todas las filas con "compartir" activo (mismo
    // criterio que el botón individual: DRC ≠ N/A) en un solo mensaje.
    btnMdShareAll?.addEventListener('click', async () => {
      if (!misDoceBody) return;
      const activeRows = qsa('tr', misDoceBody).filter(tr => {
        const shareBtn = qs('.md-share-btn', tr);
        return shareBtn && !shareBtn.disabled;
      });

      if (!activeRows.length) {
        alert('No hay zonas activas para compartir. Asigna un día de reunión de célula (DRC) primero.');
        return;
      }

      const text = activeRows.map(mdBuildShareText).join('\n\n');
      try { await navigator.clipboard.writeText(text); } catch {}
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    });

    // Defaults: tabla arranca con 4 filas (HTML). Si quedara en blanco por cambios futuros, garantiza 4.
    (() => {
      if (!misDoceBody) return;
      const rows = qsa('tr', misDoceBody);
      if (!rows.length) {
        for (let i=0; i<4; i++) mdAddRow();
        return;
      }
      // Filas ya presentes en el HTML: asegurar estado inicial de Zona y del wheel de DRC.
      initDrcWheels();
      rows.forEach(mdUpdateZonaState);
    })();


  })();
})();
