/**
 * WHOAMI-PLAY.JS — комната «Кто я?»: слоты + опционально VDO (mafia_board), секретные слова в localStorage.
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const LOBBY = String(params.get('code') || '').trim().toUpperCase();
  /** URL-подсказка; истинный статус после загрузки lobbies.host_id */
  let isHostGuess = params.get('role') === 'host';

  let myUserId = null;
  let myNickname = '';
  let lobbyRow = null;
  /** seq сервера для mafia_board */
  let boardSeqLocal = 0;
  let lastAppliedBoardSeq = 0;

  /** { vdoUrl: string, linkedUserId?: string|null }[] по индексу места */
  let seatMedia = [];

  /** UI */
  let hostPanelOpen = false;
  let boardSaveWarned = false;
  let persistBoardTimer = null;
  /** индекс слота в модалке камеры или -1 */
  let modalSlotIndex = -1;

  /** Выезжающее меню блокнота (зеркально полям на карточках) */
  let notebookOpen = false;

  let roomClosedOverlayShown = false;
  let whoamiPollTimer = null;
  let whoamiRtCh = null;

  const $ = (id) => document.getElementById(id);
  const gridEl = () => $('whoamiGrid');

  function toast(msg, cls) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show ${cls || ''}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function detachWhoamiRealtime() {
    if (whoamiRtCh && supabaseClient?.removeChannel) {
      try {
        supabaseClient.removeChannel(whoamiRtCh);
      } catch (_) {}
      whoamiRtCh = null;
    }
    if (whoamiPollTimer != null) {
      clearInterval(whoamiPollTimer);
      whoamiPollTimer = null;
    }
  }

  function escOverlay(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  /** Хост закрыл комнату или строка исчезла — общий экран, как у мафии */
  function showWhoamiRoomEndedOverlay(title, subtitle) {
    if (roomClosedOverlayShown) return;
    roomClosedOverlayShown = true;
    detachWhoamiRealtime();
    try {
      if (typeof window.hlorStats?.stopPlayTimer === 'function') window.hlorStats.stopPlayTimer();
    } catch (_) {}
    if (typeof clearActiveLobby === 'function') clearActiveLobby();

    document.body.style.overflow = 'hidden';
    const o = document.createElement('div');
    o.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
      'padding:22px;background:rgba(6,8,14,.93);backdrop-filter:blur(6px)';
    const href = 'game.html?g=whoami';
    const iconEmoji =
      String(title).indexOf('недост') >= 0 || String(title).indexOf('удал') >= 0 ? '📭' : '🚪';
    o.innerHTML = `
      <div style="max-width:400px;text-align:center;font-family:inherit;color:#eef">
        <div style="font-size:2.6rem;margin-bottom:10px">${iconEmoji}</div>
        <h2 style="margin:0 0 10px;font-size:1.2rem;font-weight:800">${escOverlay(title)}</h2>
        <p style="margin:0 0 20px;font-size:.88rem;line-height:1.5;opacity:.78">${escOverlay(subtitle)}</p>
        <a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:10px;font-weight:800;
          text-decoration:none;background:rgba(200,255,78,.92);color:#0a0c0f">На страницу игры</a>
      </div>
    `;
    document.body.appendChild(o);
  }

  function lobbyCodeForDb() {
    const c = lobbyRow?.code ?? LOBBY;
    return String(c || '').trim();
  }

  function seatCtx(row) {
    return {
      host_id: row.host_id,
      syncMafiaGrid: false,
      hostParticipatesSeat: !!(row.host_plays && row.game === 'whoami'),
    };
  }

  function normalizedPlayers(row) {
    const maxP = Math.max(2, Math.min(12, Number(row?.max_players) || 8));
    const raw = Array.isArray(row?.players) ? row.players.slice() : [];
    const U = window.LobbySeatUtils;
    if (!U) return [];
    return U.normalizeLobbySlotsForSave(raw, maxP, seatCtx(row));
  }

  function seatMax() {
    return Math.max(2, Math.min(12, Number(lobbyRow?.max_players) || 8));
  }

  function isRoomHost() {
    return myUserId != null && lobbyRow && String(lobbyRow.host_id) === String(myUserId);
  }

  function vdoUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (!/^https?:/i.test(url)) {
      const id = url.replace(/[^a-zA-Z0-9_-]/g, '');
      return id ? `https://vdo.ninja/?view=${id}&cleanoutput&transparent` : '';
    }
    try {
      const u = new URL(url);
      if (u.searchParams.has('push') && !u.searchParams.has('view')) {
        u.searchParams.set('view', u.searchParams.get('push'));
        u.searchParams.delete('push');
      }
      if (!u.searchParams.has('cleanoutput')) u.searchParams.set('cleanoutput', '');
      return u.toString();
    } catch {
      return url;
    }
  }

  function playerAtSeat(playersNorm, ix) {
    return playersNorm.find((p) => Number(p.slot) === ix);
  }

  /** localStorage слов для цели targetId */
  function wordsStorageKey(uid) {
    const code = lobbyCodeForDb().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'local';
    return `hlor_whoami_words:${code}:${uid || 'anon'}`;
  }

  function loadWordsMap() {
    try {
      const raw = localStorage.getItem(wordsStorageKey(myUserId));
      if (!raw) return {};
      const o = JSON.parse(raw);
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }

  function saveWordsTarget(targetUserId, text) {
    if (!myUserId || !targetUserId) return;
    const cur = loadWordsMap();
    const t = String(text || '').trim();
    if (!t) delete cur[targetUserId];
    else cur[targetUserId] = t;
    try {
      localStorage.setItem(wordsStorageKey(myUserId), JSON.stringify(cur));
    } catch (_) {}
  }

  function textareasWordFor(targetUserId) {
    const tid = String(targetUserId || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return Array.from(document.querySelectorAll(`textarea[data-word-for="${tid}"]`));
  }

  function syncWordMirrors(targetUserId, value, exclude) {
    textareasWordFor(targetUserId).forEach((ta) => {
      if (ta !== exclude) ta.value = value || '';
      const peek = ta.closest('.whoami-on-slot')?.querySelector('.whoami-slot-checkpeek');
      if (peek && peek.classList.contains('whoami-slot-checkpeek--open'))
        peek.textContent = ta.value.trim() ? ta.value : '— пусто —';
    });
  }

  /**
   * Подпись + поле + «Проверить» для одной цели; клики не пробивают выбор места за столом.
   */
  function mountSecretWordForTarget(root, targetPlayer, variant) {
    if (!targetPlayer || !targetPlayer.id) return;
    const targetId = String(targetPlayer.id);
    const nick = targetPlayer.nickname || 'Игрок';

    const wrap = document.createElement('div');
    wrap.className = variant === 'slot-dock' ? 'whoami-on-slot slot-dock' : 'whoami-on-slot whoami-on-slot--book';

    const stopSeat = (ev) => ev.stopPropagation();
    wrap.addEventListener('click', stopSeat);
    wrap.addEventListener('mousedown', stopSeat);

    const lab = document.createElement('label');
    lab.className = 'whoami-slot-word-label';
    lab.textContent = `Загадать для · ${nick}`;

    const row = document.createElement('div');
    row.className = 'whoami-slot-word-row';

    const textarea = document.createElement('textarea');
    textarea.className = 'whoami-slot-input whoami-slot-input--concealed';
    textarea.maxLength = 240;
    textarea.autocomplete = 'off';
    textarea.dataset.wordFor = targetId;
    textarea.placeholder = 'слово (угадывает другой)';
    textarea.value = loadWordsMap()[targetId] || '';

    const peek = document.createElement('div');
    peek.className = 'whoami-slot-checkpeek';

    textarea.addEventListener('focus', () => {
      textarea.classList.remove('whoami-slot-input--concealed');
    });
    textarea.addEventListener('blur', () => {
      if (!peek.classList.contains('whoami-slot-checkpeek--open')) textarea.classList.add('whoami-slot-input--concealed');
    });
    textarea.addEventListener('click', stopSeat);
    textarea.addEventListener('mousedown', stopSeat);
    textarea.addEventListener('input', () => {
      saveWordsTarget(targetId, textarea.value);
      syncWordMirrors(targetId, textarea.value, textarea);
      peek.textContent = textarea.value.trim() ? textarea.value : '— пусто —';
    });

    const actions = document.createElement('div');
    actions.className = 'whoami-slot-word-actions';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'whoami-btn-check';
    btn.textContent = 'Проверить';
    btn.addEventListener('mousedown', stopSeat);
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const open = peek.classList.toggle('whoami-slot-checkpeek--open');
      peek.textContent = textarea.value.trim() ? textarea.value : '— пусто —';
      if (open) textarea.classList.remove('whoami-slot-input--concealed');
      else textarea.classList.add('whoami-slot-input--concealed');
    });

    actions.appendChild(btn);

    row.appendChild(textarea);
    row.appendChild(actions);
    wrap.appendChild(lab);
    wrap.appendChild(row);
    wrap.appendChild(peek);
    root.appendChild(wrap);
  }

  function applyMafiaBoardFromRow(mb, maxP, playersNorm) {
    if (!mb || typeof mb !== 'object' || mb.v !== 1 || !Array.isArray(mb.slots)) return;
    const seq = Number(mb.seq);
    if (!Number.isFinite(seq) || seq <= lastAppliedBoardSeq) return;
    lastAppliedBoardSeq = seq;
    boardSeqLocal = Math.max(boardSeqLocal, seq);

    if (typeof mb.gridCols === 'number') {
      const inp = $('whoamiGridCols');
      if (inp && document.activeElement !== inp) {
        const n = Math.max(2, Math.min(5, Math.round(mb.gridCols)));
        inp.value = String(n);
      }
    }

    for (let i = 0; i < maxP; i++) {
      const r = mb.slots[i];
      if (!r || typeof r !== 'object') continue;
      if (!seatMedia[i]) seatMedia[i] = { vdoUrl: '', linkedUserId: null };
      if ('vdoUrl' in r) seatMedia[i].vdoUrl = typeof r.vdoUrl === 'string' ? r.vdoUrl : '';
      if ('linkedUserId' in r) seatMedia[i].linkedUserId = r.linkedUserId ?? null;
    }
  }

  function bindLinkedFromPlayers(playersNorm, maxP) {
    for (let i = 0; i < maxP; i++) {
      const p = playerAtSeat(playersNorm, i);
      if (!seatMedia[i]) seatMedia[i] = { vdoUrl: '', linkedUserId: null };
      if (p?.id != null) seatMedia[i].linkedUserId = p.id;
      else seatMedia[i].linkedUserId = null;
    }
  }

  function ensureSeatMedia(maxP) {
    while (seatMedia.length < maxP) seatMedia.push({ vdoUrl: '', linkedUserId: null });
    seatMedia.length = maxP;
  }

  function gridColsEffective() {
    const inp = $('whoamiGridCols');
    if (inp && isRoomHost()) {
      const n = Math.round(Number(inp.value) || 3);
      return Math.max(2, Math.min(5, n));
    }
    const mb = lobbyRow?.mafia_board;
    if (mb && mb.gridCols != null) return Math.max(2, Math.min(5, Math.round(Number(mb.gridCols) || 3)));
    return 3;
  }

  function persistBoardSoon() {
    if (!isRoomHost() || !supabaseClient || !LOBBY) return;
    clearTimeout(persistBoardTimer);
    persistBoardTimer = setTimeout(() => void persistBoardNow(), 140);
  }

  async function persistBoardNow() {
    persistBoardTimer = null;
    if (!isRoomHost() || !supabaseClient || !lobbyRow) return;
    const maxP = seatMax();
    ensureSeatMedia(maxP);
    bindLinkedFromPlayers(normalizedPlayers(lobbyRow), maxP);

    boardSeqLocal = Math.max(boardSeqLocal, lastAppliedBoardSeq) + 1;
    const payload = {
      v: 1,
      seq: boardSeqLocal,
      gridCols: gridColsEffective(),
      slots: seatMedia.map((s) => ({
        vdoUrl: typeof s?.vdoUrl === 'string' ? s.vdoUrl : '',
        linkedUserId: s?.linkedUserId ?? null,
      })),
    };
    try {
      const { error } = await supabaseClient.from('lobbies').update({ mafia_board: payload }).eq('code', lobbyCodeForDb());
      if (error) {
        console.warn('[whoami] mafia_board', error);
        const msg = error.message || '';
        if (
          !boardSaveWarned &&
          (msg.includes('mafia_board') ||
            msg.includes('schema cache') ||
            String(error.code || '') === 'PGRST204')
        ) {
          boardSaveWarned = true;
          $('whoamiBoardWarn')?.classList.remove('hidden');
          toast('В БД нет колонки mafia_board — камеры локально могут отличаться после обновления', 'error');
        }
      } else {
        lastAppliedBoardSeq = boardSeqLocal;
      }
    } catch (e) {
      console.warn('[whoami] mafia_board save', e);
    }
  }

  function syncLobbyIndicator(row) {
    if (typeof setActiveLobby !== 'function' || !LOBBY || !myUserId || !row) return;
    if (row.game !== 'whoami') return;
    if (row.status !== 'waiting' && row.status !== 'active') return;
    const inPl = normalizedPlayers(row).some((p) => String(p.id) === String(myUserId));
    const isHm = String(row.host_id) === String(myUserId);
    if (inPl || isHm)
      setActiveLobby(String(LOBBY).toUpperCase(), 'whoami', row.name || LOBBY, {
        roomStatus: row.status === 'active' ? 'active' : 'waiting',
        viewOrigin: 'game',
        isHost: isHm,
      });
  }

  async function fetchLobbyRow(selectCols) {
    if (!supabaseClient || !LOBBY) return { data: null, error: new Error('no supabase') };
    const cols = selectCols || '*';
    const q = lobbyCodeForDb();
    let res = await supabaseClient.from('lobbies').select(cols).eq('code', q).maybeSingle();
    if (!res?.data && q !== q.toUpperCase()) res = await supabaseClient.from('lobbies').select(cols).eq('code', q.toUpperCase()).maybeSingle();
    if (!res?.data && q !== q.toLowerCase()) res = await supabaseClient.from('lobbies').select(cols).eq('code', q.toLowerCase()).maybeSingle();
    return res;
  }

  async function refreshFromServer() {
    if (roomClosedOverlayShown) return;
    if (!supabaseClient || !LOBBY) {
      toast('Нет подключения к базе', 'error');
      return;
    }

    const { data, error } = await fetchLobbyRow('*');
    if (error) {
      toast('Не удалось загрузить комнату', 'error');
      console.warn('[whoami]', error);
      return;
    }
    if (!data) {
      try {
        if (typeof markLobbyHistoryFinished === 'function')
          void markLobbyHistoryFinished(null, LOBBY, myUserId);
      } catch (_) {}
      showWhoamiRoomEndedOverlay(
        'Комната недоступна',
        'Этого лобби больше нет — либо удалили, либо код неверный.',
      );
      return;
    }
    if (data.game !== 'whoami') {
      toast('Комната не найдена или это не режим «Кто я?»', 'error');
      return;
    }
    lobbyRow = data;

    if (data.status === 'ended') {
      try {
        if (typeof markLobbyHistoryFinished === 'function')
          void markLobbyHistoryFinished(data.id, data.code || LOBBY, myUserId);
        if (typeof window.hlorStats?.recordLobbyEnd === 'function')
          window.hlorStats.recordLobbyEnd({ lobbyCode: LOBBY });
      } catch (_) {}
      showWhoamiRoomEndedOverlay(
        'Комната закрыта хостом',
        'Лобби завершено для всех. Окно обновилось автоматически (Realtime).',
      );
      return;
    }
    lastAppliedBoardSeq = Math.max(
      lastAppliedBoardSeq,
      data.mafia_board && Number.isFinite(Number(data.mafia_board.seq)) ? Number(data.mafia_board.seq) : 0,
    );
    boardSeqLocal = Math.max(boardSeqLocal, lastAppliedBoardSeq);

    /** Роль создателя: реальный хост всегда по БД */
    isHostGuess = isRoomHost();

    $('roomCodeDisplay').textContent = String(data.code || LOBBY).toUpperCase();
    $('roomCodeDisplay').classList.remove('hidden');
    $('hostBadgeHost').classList.toggle('hidden', !isRoomHost());
    $('btnWhoamiHostPanel').classList.toggle('hidden', !isRoomHost());
    $('roomName').textContent = data.name || 'Кто я?';

    $('btnNotebook')?.classList.toggle('hidden', !myUserId);
    notebookOpen = !!(notebookOpen && myUserId);

    const maxP = seatMax();
    ensureSeatMedia(maxP);
    const plNorm = normalizedPlayers(data);

    bindLinkedFromPlayers(plNorm, maxP);
    applyMafiaBoardFromRow(data.mafia_board, maxP, plNorm);
    bindLinkedFromPlayers(plNorm, maxP);

    const gc = $('whoamiGridCols');
    if (gc && isRoomHost()) {
      const want = gridColsEffective();
      if (document.activeElement !== gc) gc.value = String(want);
    }

    syncLobbyIndicator(data);
    syncHostForm();

    renderGridPreserveIframes(plNorm);

    syncNotebookPanel(plNorm);
    refreshNotebookChrome();

    try {
      if (
        typeof maybeUpsertLobbyHistory === 'function' &&
        myUserId &&
        (data.status === 'waiting' || data.status === 'active')
      ) {
        const plNorm2 = normalizedPlayers(data);
        const inPl =
          plNorm2.some((p) => p && String(p.id) === String(myUserId)) ||
          String(data.host_id) === String(myUserId);
        if (inPl) void maybeUpsertLobbyHistory(data, myUserId);
      }
    } catch (_) {}
  }

  function syncHostForm() {
    const chk = $('chkWhoamiHostPlays');
    const gc = $('whoamiGridCols');
    const sb = $('hostSidebarWhoami');
    if (!chk || !lobbyRow) return;
    chk.checked = !!lobbyRow.host_plays;
    if (gc && !isNaN(Number(lobbyRow.mafia_board?.gridCols))) {
      gc.value = String(gridColsEffective());
    }
    if (sb) sb.classList.toggle('hidden', !hostPanelOpen || !isRoomHost());
  }

  /** Сохраняем iframe между перерисовками где возможно */
  function collectExistingIframes() {
    const m = new Map();
    gridEl()?.querySelectorAll('.mf-slot[data-i]').forEach((cell) => {
      const ix = parseInt(cell.getAttribute('data-i'), 10);
      const ifr = cell.querySelector('iframe.mf-slot__video');
      if (!Number.isNaN(ix) && ifr?.src) m.set(ix, ifr);
    });
    return m;
  }

  function renderGridPreserveIframes(plNorm) {
    const preserved = collectExistingIframes();
    renderGrid(plNorm, preserved);
  }

  function renderSlotContent(cell, ix, meta, occupant, preservedMap) {
    const wantHref = meta?.vdoUrl ? vdoUrl(meta.vdoUrl) : '';
    const pname = occupant ? occupant.nickname || 'Игрок' : '';

    cell.innerHTML = '';

    const prev = preservedMap.get(ix);
    const prevSrc = prev ? prev.getAttribute('src') || '' : '';
    const reuse = !!(prev && wantHref && prevSrc === wantHref);

    if (wantHref) {
      const ifel = reuse ? prev : document.createElement('iframe');
      if (!reuse) ifel.className = 'mf-slot__video';
      ifel.loading = 'lazy';
      ifel.referrerPolicy = 'no-referrer';
      ifel.allow = 'microphone *;camera *';
      ifel.title = pname ? `Камера · ${pname}` : 'Камера';
      if (!reuse || ifel.getAttribute('src') !== wantHref) ifel.setAttribute('src', wantHref);
      cell.appendChild(ifel);
    } else {
      const ph = document.createElement('div');
      ph.className = 'mf-slot__ph';
      ph.innerHTML = '<span class="mf-slot__ph-icon">🎦</span><span>Пусто · без трансляции</span>';
      cell.appendChild(ph);
    }

    const ov = document.createElement('div');
    ov.className = 'mf-slot__ov';
    const info = document.createElement('div');
    info.className = 'mf-slot__info';

    const nameEl = document.createElement('span');
    nameEl.className = 'mf-slot__name';
    nameEl.textContent = pname || `Место ${ix + 1}`;

    const st = document.createElement('span');
    st.className = 'mf-slot__status ' + (pname ? 'mf-slot__status--alive' : 'mf-slot__status--extinct');
    st.textContent = pname ? 'В игре' : 'Свободно';

    info.appendChild(nameEl);
    info.appendChild(st);
    ov.appendChild(info);

    if (occupant && myUserId && String(occupant.id) === String(myUserId)) cell.classList.add('mf-slot--whoami-highlight');

    if (isRoomHost()) {
      const ed = document.createElement('button');
      ed.type = 'button';
      ed.className = 'mf-slot__edit';
      ed.textContent = 'Камера';
      ed.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openSlotModal(ix);
      });
      ov.appendChild(ed);
    }

    cell.appendChild(ov);

    if (myUserId && occupant && String(occupant.id) !== String(myUserId)) {
      cell.classList.add('mf-slot--whoami-draft');
      mountSecretWordForTarget(cell, occupant, 'slot-dock');
    }
  }

  function renderGrid(plNorm, preservedMapIn) {
    const g = gridEl();
    if (!g || !lobbyRow) return;
    const preserved = preservedMapIn || collectExistingIframes();

    const maxP = seatMax();
    ensureSeatMedia(maxP);
    const cols = gridColsEffective();
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    const pl = plNorm || normalizedPlayers(lobbyRow);

    for (let i = 0; i < maxP; i++) {
      const occupant = playerAtSeat(pl, i);
      const name = occupant ? occupant.nickname || 'Игрок' : '';
      const cls = ['mf-slot', occupant ? 'mf-slot--alive mf-slot--whoami-seat' : 'mf-slot--extinct mf-slot--whoami-seat'];
      if (occupant && occupant.id != null && myUserId && String(occupant.id) !== String(myUserId)) cls.push('mf-slot--whoami-busy-other');

      const div = document.createElement('div');
      div.className = cls.join(' ');
      div.setAttribute('data-i', String(i));

      const num = document.createElement('span');
      num.className = 'mf-slot__num';
      num.textContent = String(i + 1);
      div.appendChild(num);

      renderSlotContent(div, i, seatMedia[i], occupant, preserved);

      div.addEventListener('click', (ev) => {
        if (ev.target.closest('.whoami-on-slot') || ev.target.closest('.mf-slot__edit')) return;
        void maybeClaimSeat(i, occupant);
      });

      g.appendChild(div);
    }
  }

  /** Клик по слоту: занять себе если можно */
  async function maybeClaimSeat(ix, occupant) {
    if (!myUserId || !supabaseClient || !lobbyRow || lobbyRow.status === 'ended') {
      toast('Войди в аккаунт', 'error');
      return;
    }
    const maxP = seatMax();
    if (occupant && String(occupant.id) === String(myUserId)) return;
    if (occupant) {
      toast('Место занято другим игроком', 'error');
      return;
    }
    const hostOnly = isRoomHost() && !lobbyRow.host_plays;
    if (hostOnly) {
      toast('Ты только создатель: включи «Я тоже играю» или зайди с другого аккаунта', 'info');
      return;
    }

    let plRaw = [...(Array.isArray(lobbyRow.players) ? lobbyRow.players : [])];
    if (!plRaw.some((p) => p && String(p.id) === String(myUserId))) {
      toast('Обновление состава…', 'success');
      await refreshFromServer();
      plRaw = [...(Array.isArray(lobbyRow.players) ? lobbyRow.players : [])];
      if (!plRaw.some((p) => p && String(p.id) === String(myUserId))) {
        toast('Тебя нет в комнате — зайди по коду с game.html «Кто я?»', 'error');
        return;
      }
    }

    for (let a = 0; a < 4; a++) {
      const { data: fresh, error } = await fetchLobbyRow('*');
      if (error || !fresh) {
        toast('Не удалось занять место', 'error');
        return;
      }
      let pl = [...(Array.isArray(fresh.players) ? fresh.players : [])];
      let targetIdx = ix;
      const takenByOther =
        Number.isFinite(ix) &&
        pl.some((p) => p && String(p.id) !== String(myUserId) && Number(p.slot) === ix);
      if (takenByOther) {
        const busy = new Set();
        const normPeek = normalizedPlayers(fresh);
        for (let j = 0; j < maxP; j++) {
          const o = playerAtSeat(normPeek, j);
          if (o) busy.add(j);
        }
        targetIdx = -1;
        for (let j = 0; j < maxP; j++) {
          if (!busy.has(j)) {
            targetIdx = j;
            break;
          }
        }
        if (targetIdx < 0) {
          toast('Нет свободных мест', 'error');
          return;
        }
      }

      pl = pl
        .map((p) => {
          if (!p || String(p.id) === String(myUserId)) return p;
          if (Number(p.slot) === ix || Number(p.slot) === targetIdx || Number(p.mafia_slot) === ix || Number(p.mafia_slot) === targetIdx)
            return { ...p, slot: null };
          return p;
        })
        .filter(Boolean);

      const meIdx = pl.findIndex((p) => p && String(p.id) === String(myUserId));
      const rowMerged = meIdx >= 0 ? pl[meIdx] : { id: myUserId, nickname: myNickname, ready: false };
      rowMerged.slot = targetIdx;
      delete rowMerged.mafia_slot;
      if (meIdx >= 0) pl[meIdx] = rowMerged;
      else pl.push({ ...rowMerged, joined_at: Date.now(), ready: false });

      let normPl = window.LobbySeatUtils.normalizeLobbySlotsForSave(pl, seatMax(), seatCtx(fresh));

      const { error: upErr } = await supabaseClient.from('lobbies').update({ players: normPl }).eq('code', lobbyCodeForDb());
      if (!upErr) {
        toast('Место выбрано', 'success');
        await refreshFromServer();
        persistBoardSoon();
        return;
      }
      await new Promise((r) => setTimeout(r, 90 + a * 60));
    }
    toast('Попробуй ещё раз — место заняли параллельно', 'error');
  }

  /** Содержимое выезжающего блокнота (зеркально полям на карточках) */
  function syncNotebookPanel(plNorm) {
    const hint = $('notesHintLoggedOut');
    const list = $('notebookList');
    if (!hint || !list) return;

    if (!myUserId) {
      hint.classList.remove('hidden');
      list.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    hint.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = '';

    const others = plNorm.filter((p) => p && String(p.id) !== String(myUserId));

    if (!others.length) {
      list.innerHTML = '<p class="whoami-notebook-empty">Когда игроки сядут в слоты, здесь можно править те же строки.</p>';
      return;
    }

    others.forEach((p) => mountSecretWordForTarget(list, p, 'book'));
  }

  function refreshNotebookChrome() {
    const nb = $('whoamiNotebook');
    const bk = $('whoamiNotebookBackdrop');
    const bt = $('btnNotebook');
    if (!myUserId) {
      notebookOpen = false;
      bk?.classList.add('hidden');
      nb?.classList.add('hidden');
      bt?.classList.toggle('whoami-notebook-tab--active', false);
      return;
    }

    bk?.classList.toggle('hidden', !notebookOpen);
    nb?.classList.toggle('hidden', !notebookOpen);
    bk?.setAttribute('aria-hidden', notebookOpen ? 'false' : 'true');
    nb?.setAttribute('aria-hidden', notebookOpen ? 'false' : 'true');
    bt?.classList.toggle('whoami-notebook-tab--active', !!notebookOpen);
  }

  async function setHostParticipates(play) {
    if (!isRoomHost() || !supabaseClient || !lobbyRow) return;
    let players = [...(Array.isArray(lobbyRow.players) ? lobbyRow.players : [])];
    const hid = String(lobbyRow.host_id);
    players = players.filter((p) => p && String(p.id) !== hid);
    const maxP = seatMax();
    const chk = $('chkWhoamiHostPlays');

    const nextRow = { ...lobbyRow, host_plays: !!play };

    const ctxSeat = seatCtx(nextRow);

    if (play) {
      players.push({
        id: lobbyRow.host_id,
        nickname: lobbyRow.host_name || myNickname || 'Создатель',
        ready: false,
        joined_at: Date.now(),
      });
    }

    const normPl = window.LobbySeatUtils.normalizeLobbySlotsForSave(players, maxP, ctxSeat);
    try {
      const { error } = await supabaseClient
        .from('lobbies')
        .update({ host_plays: !!play, players: normPl })
        .eq('code', lobbyCodeForDb());
      if (error) throw error;
      toast(play ? 'Ты добавлен как игрок — выбери место' : 'Режим «только создатель»: слот можно занять только гостям', 'success');
      await refreshFromServer();
    } catch (e) {
      toast(e.message || 'Не удалось обновить', 'error');
      if (chk) chk.checked = !!lobbyRow?.host_plays;
    }
    syncHostForm();
  }

  function openSlotModal(ix) {
    modalSlotIndex = ix;
    const m = $('whoamiSlotModal');
    $('whoamiModalTitle').textContent = `Слот ${ix + 1} · трансляция`;
    $('whoamiModalVdo').value = seatMedia[ix]?.vdoUrl || '';
    m.classList.remove('hidden');
    $('whoamiModalVdo')?.focus();
  }

  function closeSlotModal() {
    $('whoamiSlotModal')?.classList.add('hidden');
    modalSlotIndex = -1;
  }

  function saveSlotModal() {
    if (!isRoomHost() || modalSlotIndex < 0) return closeSlotModal();
    const ix = modalSlotIndex;
    ensureSeatMedia(seatMax());
    seatMedia[ix].vdoUrl = String($('whoamiModalVdo')?.value || '').trim();
    closeSlotModal();
    renderGridPreserveIframes(normalizedPlayers(lobbyRow));
    persistBoardSoon();
  }

  async function bootstrap() {
    if (!LOBBY) {
      toast('Нет кода комнаты в ссылке', 'error');
      return;
    }
    $('btnLeaveLobby')?.addEventListener('click', () => {
      if (typeof leaveFromIndicator === 'function') leaveFromIndicator();
      else toast('Нет виджета выхода — обновите страницу', 'error');
    });

    $('btnWhoamiHostPanel')?.addEventListener('click', () => {
      if (!isRoomHost()) return;
      hostPanelOpen = true;
      syncHostForm();
      $('hostSidebarWhoami').classList.remove('hidden');
    });
    $('btnCloseHostWhoami')?.addEventListener('click', () => {
      hostPanelOpen = false;
      $('hostSidebarWhoami').classList.add('hidden');
    });

    $('chkWhoamiHostPlays')?.addEventListener('change', (e) => void setHostParticipates(!!e.target.checked));

    $('whoamiGridCols')?.addEventListener('change', () => {
      if (!isRoomHost()) return;
      renderGridPreserveIframes(normalizedPlayers(lobbyRow));
      persistBoardSoon();
    });

    $('btnWhoamiEndLobby')?.addEventListener('click', async () => {
      if (!isRoomHost()) return;
      if (!window.confirm('Закрыть комнату для всех участников? Это необратимо для этого кода.')) return;
      try {
        const { error } = await supabaseClient.from('lobbies').update({ status: 'ended' }).eq('code', lobbyCodeForDb());
        if (error) throw error;
        if (typeof clearActiveLobby === 'function') clearActiveLobby();
        window.location.href = 'game.html?g=whoami';
      } catch (e) {
        toast(e.message || 'Ошибка', 'error');
      }
    });

    $('whoamiModalClose')?.addEventListener('click', closeSlotModal);
    $('whoamiModalSave')?.addEventListener('click', saveSlotModal);
    $('whoamiModalClearCam')?.addEventListener('click', () => {
      if (modalSlotIndex >= 0) $('whoamiModalVdo').value = '';
      saveSlotModal();
    });

    document.getElementById('whoamiSlotModal')?.addEventListener('click', (ev) => {
      if (ev.target.id === 'whoamiSlotModal') closeSlotModal();
    });

    $('btnNotebook')?.addEventListener('click', () => {
      if (!myUserId) return;
      notebookOpen = !notebookOpen;
      refreshNotebookChrome();
    });
    $('btnNotebookClose')?.addEventListener('click', () => {
      notebookOpen = false;
      refreshNotebookChrome();
    });
    $('whoamiNotebookBackdrop')?.addEventListener('click', () => {
      notebookOpen = false;
      refreshNotebookChrome();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !notebookOpen) return;
      notebookOpen = false;
      refreshNotebookChrome();
    });

    if (supabaseClient) {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (session?.user) {
        myUserId = session.user.id;
        let nick = '';
        try {
          const { data } = await supabaseClient.from('profiles').select('nickname').eq('id', myUserId).maybeSingle();
          nick = data?.nickname || '';
        } catch (_) {}
        myNickname = nick || session.user.email?.split('@')[0] || 'Игрок';
      }
    }

    await refreshFromServer();

    if (!roomClosedOverlayShown && lobbyRow && lobbyRow.status !== 'ended') {
      if (typeof window.hlorStats?.recordTableOpen === 'function' && LOBBY)
        window.hlorStats.recordTableOpen(LOBBY, 'whoami');
      if (typeof window.hlorStats?.startPlayTimer === 'function') window.hlorStats.startPlayTimer();
    }

    if (!roomClosedOverlayShown && supabaseClient) {
      const codeRt = lobbyRow ? String(lobbyRow.code) : LOBBY;
      whoamiRtCh = supabaseClient
        .channel(`whoami_rt:${codeRt.replace(/[^\w.-]/g, '_')}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${codeRt}` },
          () => void refreshFromServer(),
        )
        .subscribe();

      whoamiPollTimer = window.setInterval(() => void refreshFromServer(), 18000);
    }

    window.addEventListener('beforeunload', () => detachWhoamiRealtime());
  }

  document.addEventListener('DOMContentLoaded', () => void bootstrap());
})();
