/**
 * MAFIA-PLAY.JS
 * Полная игровая страница Мафии с:
 *  - Ролями HOST / PLAYER
 *  - Приватными уведомлениями о роли (модальное окно + бэйдж над столом)
 *  - Realtime синхронизацией стола через Supabase Broadcast (без чата)
 *  - Хост-слотом (ведущий не в сетке)
 *  - Управлением фазами, таймером, рандомными событиями
 *  - Горячей клавишей «admin» → суперадмин
 */

(function () {
  'use strict';

  // ── URL-параметры ────────────────────────────────────────────────────────────
  const params   = new URLSearchParams(window.location.search);
  /** Как в БД — в одном регистре, чтобы Realtime postgres_changes фильтр совпадал. */
  const LOBBY    = String(params.get('code') || '').trim().toUpperCase();
  /** URL — лишь подсказка; истина — host_id в БД (см. resolveLobbyAndUser) */
  let isHostFlag = params.get('role') === 'host';
  let mySlot     = parseInt(params.get('slot') ?? '-1', 10);
  const CHANNEL  = `mafia:${LOBBY || 'local'}`;
  /** Каждая комната — отдельные слоты/настройки в localStorage (без призраков старых игр). */
  function lobbyLsId() {
    return String(LOBBY || 'local').toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'local';
  }
  function slotsLsKey() {
    return `hlor_mafia_slots:${lobbyLsId()}`;
  }
  function settingsLsKey() {
    return `hlor_mafia_settings:${lobbyLsId()}`;
  }

  // ── Константы ────────────────────────────────────────────────────────────────
  const TOTAL     = 12;
  const ROLES_MAP = { 'Мафия':'mafia','Шериф':'sheriff','Доктор':'doctor','Маньяк':'maniac','Любовница':'other','Комиссар':'sheriff','Мирный':'civil' };
  const ROLES_INFO = {
    'Мирный':    'Найди мафию голосованием. Победа — исключить всех мафиози.',
    'Мафия':     'Ночью выбираете жертву. Победа — сравняться по числу с мирными.',
    'Шериф':     'Ночью проверяешь одного игрока. Узнаёшь — мирный или нет.',
    'Доктор':    'Ночью лечишь одного игрока. Можно спасти себя, но только раз.',
    'Маньяк':    'Действуешь один. Победа — остаться последним живым.',
    'Любовница': 'Ночью блокируешь одного игрока — он не может действовать.',
    'Комиссар':  'Можешь арестовать игрока ночью — он пропускает день.',
  };
  const STATUS_LBL = { alive:'ЖИВ', dead:'МЁРТВ', extinct:'ВЫБЫЛ' };
  const PHASES = {
    day:   { icon:'☀️', text:'ДЕНЬ — Обсуждение',       css:'ph-day'   },
    night: { icon:'🌙', text:'НОЧЬ — Мафия действует',  css:'ph-night' },
    vote:  { icon:'🗳️', text:'ГОЛОСОВАНИЕ',              css:'ph-vote'  },
    wait:  { icon:'⏳', text:'Ожидание игроков...',      css:'ph-wait'  },
  };

  // ── Состояние ────────────────────────────────────────────────────────────────
  let slots        = loadSlots();
  let activeSlots  = 12;
  let gridCols     = 4;
  let phase        = 'wait';
  let timerInt     = null;
  let randQueued   = false;
  let editIdx      = null;
  let hostOpen     = false;
  let rtChannel    = null;
  let myNickname   = 'Игрок';
  let myUserId     = null;
  /** id → ник из строки lobbies.players (обновляется по опросу БД) */
  let lobbyPlayersMap = {};
  /** Полный массив игроков лобби (с mafia_slot, id) */
  let lobbyPlayersRaw = [];
  let roomHostId       = null;
  let presenterUserId  = null;
  let isRoomHost       = false;

  let lobbyDbRealtimeCh = null;
  let roomClosedOverlayShown = false;

  function detachLobbyRowRealtime() {
    if (lobbyDbRealtimeCh && supabaseClient?.removeChannel) {
      try {
        supabaseClient.removeChannel(lobbyDbRealtimeCh);
      } catch (_) {}
      lobbyDbRealtimeCh = null;
    }
  }

  function attachLobbyRowRealtime() {
    if (!supabaseClient || !LOBBY) return;
    detachLobbyRowRealtime();
    const chName = `mafia_lobby:${String(LOBBY).replace(/[^\w]/g, '_')}`;
    try {
      lobbyDbRealtimeCh = supabaseClient
        .channel(chName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${LOBBY}` },
          () => {
            refreshPlayerMapFromDb();
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[mafia] Realtime для lobbies недоступен (включи Replication в Supabase)');
          }
        });
    } catch (e) {
      console.warn('[mafia] realtime', e);
    }
  }

  /** Хост закрыл комнату или строка удалена — все на странице уходят с сообщением */
  function showRoomEndedOverlay(title, subtitle) {
    if (roomClosedOverlayShown) return;
    roomClosedOverlayShown = true;
    try {
      if (timerInt) clearInterval(timerInt);
      timerInt = null;
      const tel = document.getElementById('timerEl');
      if (tel) tel.textContent = '';
    } catch (_) {}
    detachLobbyRowRealtime();
    if (rtChannel && supabaseClient?.removeChannel) {
      try {
        supabaseClient.removeChannel(rtChannel);
      } catch (_) {}
      rtChannel = null;
    }
    if (typeof clearActiveLobby === 'function') clearActiveLobby();

    document.body.style.overflow = 'hidden';
    const o = document.createElement('div');
    o.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;' +
      'padding:22px;background:rgba(6,8,14,.93);backdrop-filter:blur(6px)';
    const href = 'game.html?g=mafia';
    o.innerHTML = `
      <div style="max-width:400px;text-align:center;font-family:inherit;color:#eef">
        <div style="font-size:2.6rem;margin-bottom:10px">${title.indexOf('удал') >= 0 ? '📭' : '🚪'}</div>
        <h2 style="margin:0 0 10px;font-size:1.2rem;font-weight:800">${esc(title)}</h2>
        <p style="margin:0 0 20px;font-size:.88rem;line-height:1.5;opacity:.78">${esc(subtitle)}</p>
        <a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:10px;font-weight:800;
          text-decoration:none;background:rgba(200,255,78,.92);color:#0a0c0f">На страницу игры</a>
      </div>
    `;
    document.body.appendChild(o);
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const $grid      = () => document.getElementById('mafiaGrid');
  const $toast     = () => document.getElementById('toast');
  const $timerEl   = () => document.getElementById('timerEl');

  async function fetchProfileQuick(uid) {
    if (!supabaseClient || !uid) return null;
    const { data } = await supabaseClient.from('profiles').select('nickname').eq('id', uid).maybeSingle();
    return data;
  }

  function rebuildLobbyPlayersMap(players) {
    lobbyPlayersMap = {};
    (players || []).forEach((p) => {
      if (p && p.id != null) lobbyPlayersMap[String(p.id)] = p.nickname;
    });
  }

  function applyLobbyGridFromRow(row) {
    if (!row || row.max_players == null || row.max_players === undefined) return;
    const m = Math.max(1, Math.min(TOTAL, Number(row.max_players) || 8));
    activeSlots = m;
    const inp = document.getElementById('settingSlots');
    if (inp) inp.value = String(m);
  }

  function syncMafiaLobbyIndicator(row) {
    if (typeof setActiveLobby !== 'function' || !LOBBY || !row || !myUserId) return;
    if (row.status !== 'waiting' && row.status !== 'active') return;
    const inPl = (row.players || []).some((p) => String(p.id) === String(myUserId));
    const isH = String(row.host_id) === String(myUserId);
    if (inPl || isH) {
      setActiveLobby(String(LOBBY).toUpperCase(), row.game || 'mafia', row.name || LOBBY, {
        roomStatus: row.status === 'active' ? 'active' : 'waiting',
        viewOrigin: 'game',
        isHost: isH,
      });
    }
  }

  async function refreshPlayerMapFromDb() {
    if (!LOBBY || !supabaseClient) return;
    try {
      const { data } = await supabaseClient
        .from('lobbies')
        .select('players,host_id,host_name,presenter_id,max_players,name,status,game')
        .eq('code', LOBBY)
        .maybeSingle();
      if (!data) {
        showRoomEndedOverlay('Комната недоступна', 'Этого лобби больше нет — либо удалили, либо код неверный.');
        return;
      }
      if (data.status === 'ended') {
        showRoomEndedOverlay(
          'Комната закрыта хостом',
          'Лобби завершено для всех. Окно обновилось автоматически (Realtime).',
        );
        return;
      }
      roomHostId      = data.host_id;
      presenterUserId = data.presenter_id || null;
      lobbyPlayersRaw = Array.isArray(data.players) ? data.players : [];

      let players = [...lobbyPlayersRaw];
      let host_name = data.host_name;
      let changed = false;
      if (myUserId) {
        const i = players.findIndex((p) => String(p.id) === String(myUserId));
        if (i >= 0 && players[i].nickname !== myNickname) {
          players[i] = { ...players[i], nickname: myNickname };
          changed = true;
        }
        if (String(data.host_id) === String(myUserId) && host_name !== myNickname) {
          host_name = myNickname;
          changed = true;
        }
      }
      if (changed) {
        await supabaseClient.from('lobbies').update({ players, host_name }).eq('code', LOBBY);
        lobbyPlayersRaw = players;
        rebuildLobbyPlayersMap(players);
      } else {
        rebuildLobbyPlayersMap(data.players);
      }
      isRoomHost = !!(myUserId && roomHostId && String(roomHostId) === String(myUserId));
      recomputeGameMasterFlags();
      applyLobbyGridFromRow(data);
      syncMafiaLobbyIndicator(data);
      applyLobbySlotBindings();
      renderGrid();
      updatePresenterForm();
      updateHostPanelTabsVisibility();
      refreshTopBarBadges();
      updateLobbyModerationUI();
    } catch (_) {}
  }

  function recomputeGameMasterFlags() {
    isHostFlag =
      !!myUserId &&
      ((presenterUserId && String(presenterUserId) === String(myUserId)) ||
        (!presenterUserId && roomHostId && String(roomHostId) === String(myUserId)));
    if (isHostFlag) {
      mySlot = -1;
    } else {
      const mePl = lobbyPlayersRaw.find((p) => String(p.id) === String(myUserId));
      if (mePl && mePl.mafia_slot != null && mePl.mafia_slot !== '' && !Number.isNaN(Number(mePl.mafia_slot))) {
        mySlot = Number(mePl.mafia_slot);
      }
    }
  }

  function applyLobbySlotBindings() {
    for (let i = 0; i < TOTAL; i++) {
      if (i >= activeSlots) {
        slots[i].linkedUserId = null;
        continue;
      }
      const bound = lobbyPlayersRaw.find((p) => Number(p.mafia_slot) === i);
      if (bound) {
        slots[i].linkedUserId = bound.id;
        if (!slots[i].name?.trim()) slots[i].name = bound.nickname || '';
      } else if (slots[i].linkedUserId && !lobbyPlayersRaw.some((p) => String(p.id) === String(slots[i].linkedUserId) && Number(p.mafia_slot) === i)) {
        slots[i].linkedUserId = null;
      }
    }
  }

  async function upsertPlayerMafiaSlot(slotIndex, userId) {
    if (!LOBBY || !supabaseClient) return;
    const { data } = await supabaseClient.from('lobbies').select('players').eq('code', LOBBY).maybeSingle();
    let pl = (data?.players || []).map((p) => {
      const q = { ...p };
      if (Number(q.mafia_slot) === slotIndex) q.mafia_slot = null;
      return q;
    });
    if (userId) {
      pl = pl.map((p) => (String(p.id) === String(userId) ? { ...p, mafia_slot: slotIndex } : p));
    }
    await supabaseClient.from('lobbies').update({ players: pl }).eq('code', LOBBY);
    lobbyPlayersRaw = pl;
    rebuildLobbyPlayersMap(pl);
  }

  /** Индекс первого свободного места 0 … max−1 по данным комнаты (очередь «кто первый занял — тот ниже номер»). */
  function getFirstFreeMafiaSlot(max) {
    const taken = new Set();
    for (const p of lobbyPlayersRaw) {
      const ms = Number(p.mafia_slot);
      if (!Number.isNaN(ms) && ms >= 0 && ms < max) taken.add(ms);
    }
    for (let j = 0; j < max; j++) {
      if (!taken.has(j)) return j;
    }
    return -1;
  }

  async function tryClaimSlot(clickedIndex) {
    if (isHostFlag || clickedIndex < 0 || clickedIndex >= activeSlots) return;
    if (!myUserId || !LOBBY || !supabaseClient) {
      toast('Войди в аккаунт', 'error');
      return;
    }
    const meRow = lobbyPlayersRaw.find((p) => String(p.id) === String(myUserId));
    if (meRow != null && meRow.mafia_slot != null && meRow.mafia_slot !== '') {
      const cur = Number(meRow.mafia_slot);
      if (!Number.isNaN(cur) && cur >= 0) {
        toast(`Ты уже за столом — место ${cur + 1}. Перестановкой занимается ведущий.`, 'error');
        return;
      }
    }
    const foreign = lobbyPlayersRaw.some(
      (p) =>
        Number(p.mafia_slot) === clickedIndex && p.id != null && String(p.id) !== String(myUserId)
    );
    if (foreign) {
      toast('Это место занято другим игроком.', 'error');
      return;
    }
    if (slots[clickedIndex]?.vdoUrl || slots[clickedIndex]?.role) {
      toast('Этот слот настроен ведущим — выбери обычный.', 'error');
      return;
    }
    let target = getFirstFreeMafiaSlot(activeSlots);
    if (target < 0) {
      toast('Все места за столом заняты.', 'error');
      return;
    }
    const takenByOther = lobbyPlayersRaw.some(
      (p) => Number(p.mafia_slot) === target && String(p.id) !== String(myUserId)
    );
    if (takenByOther) {
      toast('Место только что заняли — пробуй ещё раз.', 'error');
      return;
    }
    await upsertPlayerMafiaSlot(target, myUserId);
    await refreshPlayerMapFromDb();
    const hintWrongCell = clickedIndex !== target && !slots[clickedIndex]?.linkedUserId;
    toast(
      hintWrongCell
        ? `По очереди твоё место — №${target + 1} (ещё можно нажать на любую свободную клетку).`
        : `Ты занял место ${target + 1}.`,
      'success',
    );
  }

  function updatePresenterForm() {
    const codeBlock = document.getElementById('mfRoomCodeBlock');
    if (codeBlock) codeBlock.classList.toggle('hidden', !isRoomHost);
    const codeDisp = document.getElementById('mfRoomCodeDisplay');
    if (codeDisp) codeDisp.textContent = (LOBBY || '—').toUpperCase();
    const block = document.getElementById('presenterRoomBlock');
    if (block) block.classList.toggle('hidden', !isRoomHost);
    const chk = document.getElementById('chkSeparatePresenter');
    const sel = document.getElementById('selectPresenter');
    const st  = document.getElementById('presenterStatusLine');
    if (!chk || !sel) return;
    chk.checked = !!presenterUserId;
    sel.disabled = !chk.checked;
    sel.innerHTML = '<option value="">— Кто ведёт игру —</option>';
    lobbyPlayersRaw.forEach((p) => {
      if (!p.id) return;
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.nickname || 'Игрок'}${String(p.id) === String(roomHostId) ? ' · создатель' : ''}`;
      sel.appendChild(o);
    });
    if (presenterUserId) sel.value = String(presenterUserId);
    else sel.value = '';
    if (st) {
      if (!presenterUserId) st.textContent = 'Сейчас игрой управляет создатель лобби.';
      else if (String(presenterUserId) === String(myUserId)) st.textContent = 'Ты назначен ведущим за столом.';
      else st.textContent = 'Ведущий назначен — панель управления только у него.';
    }
  }

  function updateHostPanelTabsVisibility() {
    const roomOnly = isRoomHost && !isHostFlag;
    document.querySelectorAll('.mf-for-game-master').forEach((el) => el.classList.toggle('hidden', roomOnly));
    const stabs = document.getElementById('hostStabs');
    if (stabs) stabs.classList.toggle('hidden', roomOnly);
    const hint = document.getElementById('roomOnlyHint');
    if (hint) hint.classList.toggle('hidden', !roomOnly);

    if (roomOnly) {
      document.querySelectorAll('.mf-stab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.mf-stab-panel').forEach((x) => {
        x.classList.add('hidden');
        x.classList.remove('active');
      });
      const settings = document.getElementById('stab-settings');
      const tS = document.querySelector('.mf-stab[data-stab="settings"]');
      if (settings) {
        settings.classList.remove('hidden');
        settings.classList.add('active');
      }
      if (tS) tS.classList.add('active');
    } else {
      if (stabs) stabs.classList.remove('hidden');
      const playersTab = document.getElementById('stab-players');
      const phasesTab = document.getElementById('stab-phases');
      const settingsPanel = document.getElementById('stab-settings');
      document.querySelectorAll('.mf-stab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.mf-stab-panel').forEach((x) => {
        x.classList.add('hidden');
        x.classList.remove('active');
      });
      document.querySelector('.mf-stab[data-stab="players"]')?.classList.add('active');
      if (playersTab) {
        playersTab.classList.remove('hidden');
        playersTab.classList.add('active');
      }
      if (phasesTab) phasesTab.classList.add('hidden');
      if (settingsPanel) settingsPanel.classList.add('hidden');
    }
  }

  function refreshTopBarBadges() {
    document.getElementById('hostBadge')?.classList.toggle('hidden', !isHostFlag);
    document.getElementById('roomOwnerBadge')?.classList.toggle('hidden', !(isRoomHost && !isHostFlag));
    document.getElementById('btnHostPanel')?.classList.toggle('hidden', !(isHostFlag || isRoomHost));
  }


  async function resolveLobbyAndUser() {
    mySlot = parseInt(params.get('slot') ?? '-1', 10);
    isHostFlag = params.get('role') === 'host';
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      myUserId = session.user.id;
      const prof = await fetchProfileQuick(myUserId);
      myNickname = prof?.nickname || session.user.email?.split('@')[0] || 'Игрок';
    }
    if (!LOBBY || !myUserId) return;
    try {
      const { data: row } = await supabaseClient
        .from('lobbies')
        .select('host_id,players,presenter_id,max_players,name,status,game')
        .eq('code', LOBBY)
        .maybeSingle();
      if (row) {
        roomHostId      = row.host_id;
        presenterUserId = row.presenter_id || null;
        lobbyPlayersRaw = Array.isArray(row.players) ? row.players : [];
        isRoomHost      = String(row.host_id) === String(myUserId);
        rebuildLobbyPlayersMap(row.players);
        recomputeGameMasterFlags();
        applyLobbyGridFromRow(row);
        syncMafiaLobbyIndicator(row);
        applyLobbySlotBindings();
        updateLobbyModerationUI();
      }
    } catch (e) {
      console.warn('[mafia] resolveLobbyAndUser', e);
    }
  }

  /** Модальное окно роли игроку (ведущий шлёт по сети через broadcast или меняешь слот) */
  function setupRoleRevealModal() {
    const overlay = document.getElementById('roleRevealOverlay');
    const dismiss = document.getElementById('roleRevealDismiss');
    if (!overlay || !dismiss) return;
    dismiss.addEventListener('click', closeRoleReveal);
    overlay.querySelector('.mf-role-reveal__backdrop')?.addEventListener('click', closeRoleReveal);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || overlay.classList.contains('hidden')) return;
      closeRoleReveal();
    });
  }

  function closeRoleReveal() {
    const overlay = document.getElementById('roleRevealOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    if (!roomClosedOverlayShown) document.body.style.overflow = '';
  }

  function openRoleReveal(role, subtitle) {
    const overlay = document.getElementById('roleRevealOverlay');
    const rn = document.getElementById('roleRevealRoleName');
    const dh = document.getElementById('roleRevealHint');
    if (!overlay || !rn) return;
    const cls = ROLES_MAP[role] || 'other';
    rn.textContent = role;
    rn.className = `mf-role-reveal__name mf-slot__role--${cls}`;
    if (dh) dh.textContent = subtitle || ROLES_INFO[role] || '';
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    try {
      document.getElementById('roleRevealDismiss')?.focus();
    } catch (_) {}
  }

  // ── INIT ─────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    applySettings();
    await resolveLobbyAndUser();
    renderGrid();
    setupRoleRevealModal();
    setupRoleUI();
    setupSidebars();
    setupSlotModal();
    setupHostControls();
    setupPresenterControls();
    setupHotkeys();
    initGameBroadcast();
    attachLobbyRowRealtime();
    const LOBBY_DB_POLL_MS = 6000;
    setInterval(refreshPlayerMapFromDb, LOBBY_DB_POLL_MS);
    updatePresenterForm();
    updateHostPanelTabsVisibility();
    refreshTopBarBadges();
    if (isHostFlag) toast('Панель «Ведущий» — назначай роли в слоте; игрокам роль покажется отдельным окном.', 'success');
    updateLobbyModerationUI();
  });

  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted || !LOBBY) return;
    resolveLobbyAndUser().then(() => {
      renderGrid();
      setupRoleUI();
      refreshTopBarBadges();
      updatePresenterForm();
      updateHostPanelTabsVisibility();
    });
  });

  function setupPresenterControls() {
    const chk = document.getElementById('chkSeparatePresenter');
    const sel = document.getElementById('selectPresenter');
    if (chk && sel) {
      chk.addEventListener('change', () => {
        sel.disabled = !chk.checked;
        if (!chk.checked) sel.value = '';
      });
    }
    document.getElementById('btnSavePresenter')?.addEventListener('click', savePresenterSettings);
    document.getElementById('btnCopyRoomCode')?.addEventListener('click', async () => {
      const c = String(LOBBY || '').trim().toUpperCase();
      if (!c) return;
      try {
        await navigator.clipboard.writeText(c);
        toast('Код скопирован', 'success');
      } catch (_) {
        toast(c, 'success');
      }
    });
  }

  async function savePresenterSettings() {
    if (!isRoomHost || !supabaseClient || !LOBBY) return;
    const chk = document.getElementById('chkSeparatePresenter');
    const sel = document.getElementById('selectPresenter');
    const sep = chk?.checked;
    let pid = sep && sel?.value ? sel.value : null;
    if (pid && roomHostId && String(pid) === String(roomHostId)) pid = null;
    if (sep && !pid) {
      toast('Выбери другого игрока ведущим или сними галочку', 'error');
      return;
    }
    try {
      await supabaseClient.from('lobbies').update({ presenter_id: pid }).eq('code', LOBBY);
      presenterUserId = pid;
      await resolveLobbyAndUser();
      updatePresenterForm();
      updateHostPanelTabsVisibility();
      refreshTopBarBadges();
      setupRoleUI();
      renderGrid();
      toast(pid ? 'Ведущий сохранён' : 'Снова управляешь игрой ты', 'success');
    } catch (e) {
      toast('Нужна колонка presenter_id в БД (см. supabase/lobbies_extra_columns.sql)', 'error');
    }
  }

  // ── ROLE UI ──────────────────────────────────────────────────────────────────
  function setupRoleUI() {
    refreshTopBarBadges();
    if (isHostFlag) {
      document.getElementById('myRoleWrap')?.classList.add('hidden');
    } else {
      if (mySlot >= 0 && slots[mySlot]?.role) showMyRole(slots[mySlot].role);
    }
  }

  function showMyRole(role) {
    const wrap = document.getElementById('myRoleWrap');
    const val  = document.getElementById('myRoleVal');
    wrap.classList.remove('hidden');
    val.textContent = role;
    const cls = ROLES_MAP[role] || 'other';
    val.className = `mf-role-badge__val mf-slot__role--${cls}`;
  }

  // ── GRID ─────────────────────────────────────────────────────────────────────
  function renderGrid() {
    const g = $grid();
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${gridCols},1fr)`;
    for (let i = 0; i < activeSlots; i++) g.appendChild(makeSlot(i));
  }

  function renderSlot(i) {
    const cur = $grid().querySelector(`[data-i="${i}"]`);
    if (cur) cur.replaceWith(makeSlot(i)); else renderGrid();
  }

  function makeSlot(i) {
    const s   = slots[i];
    const cfg = !!(s.name || s.vdoUrl);
    const div = document.createElement('div');
    div.className = 'mf-slot' + (cfg ? ` mf-slot--${s.status}` : '');
    div.dataset.i = i;

    // Номер
    const num = ce('div','mf-slot__num'); num.textContent = i+1; div.appendChild(num);

    // Кнопка редактирования (только хост)
    if (isHostFlag) {
      const eb = ce('button','mf-slot__edit'); eb.textContent = '✎';
      eb.addEventListener('click', e => { e.stopPropagation(); openSlotModal(i); });
      div.appendChild(eb);
    }

    // Видео / плейсхолдер
    if (s.vdoUrl && s.status !== 'extinct') {
      const iframe = document.createElement('iframe');
      iframe.className = 'mf-slot__video';
      iframe.src = vdoUrl(s.vdoUrl);
      iframe.allow = 'autoplay; camera; microphone; fullscreen';
      iframe.setAttribute('allowfullscreen','');
      div.appendChild(iframe);
    } else {
      const ph = ce('div','mf-slot__ph');
      ph.innerHTML = cfg && s.status === 'extinct'
        ? `<span class="mf-slot__ph-icon">🚫</span><span>ВЫБЫЛ</span>`
        : `<span class="mf-slot__ph-icon">📷</span><span>${esc(s.name) || `Слот ${i+1}`}</span>`;
      if (!isHostFlag && !cfg && i < activeSlots) {
        const hint = ce('div');
        hint.style.cssText = 'font-size:0.58rem;opacity:0.5;margin-top:4px;text-transform:uppercase';
        hint.textContent = 'Нажми — место по очереди';
        ph.appendChild(hint);
      }
      div.appendChild(ph);
    }

    // Нижний оверлей
    if (cfg) {
      const ov = ce('div','mf-slot__ov');
      const inf = ce('div','mf-slot__info');

      const nm = ce('div','mf-slot__name'); nm.textContent = s.name || `Слот ${i+1}`; inf.appendChild(nm);

      // Роль: ведущему всегда на слотах; себе на своём слоте (остальным чужих ролей не показываем)
      const showRoleOv = !!(s.role && (isHostFlag || i === mySlot));
      if (showRoleOv) {
        const rl = ce('div',`mf-slot__role mf-slot__role--${ROLES_MAP[s.role]||'other'}`);
        rl.textContent = s.role;
        inf.appendChild(rl);
      }

      const st = ce('div',`mf-slot__status mf-slot__status--${s.status}`);
      st.textContent = STATUS_LBL[s.status]||''; inf.appendChild(st);

      ov.appendChild(inf);

      // Голосование
      const votes = ce('div','mf-slot__votes');
      const minus = ce('button','mf-vote-btn'); minus.innerHTML = '−';
      const cnt   = ce('span','mf-vote-count');  cnt.textContent = s.votes||0;
      const plus  = ce('button','mf-vote-btn'); plus.innerHTML = '+';
      minus.addEventListener('click', e => { e.stopPropagation(); if(s.votes>0){s.votes--;cnt.textContent=s.votes;saveSlots();} });
      plus.addEventListener('click',  e => { e.stopPropagation(); s.votes++;cnt.textContent=s.votes;saveSlots(); });
      votes.append(minus, cnt, plus);
      ov.appendChild(votes);

      div.appendChild(ov);
    }

    if (isHostFlag) div.addEventListener('click', () => openSlotModal(i));
    else div.addEventListener('click', () => tryClaimSlot(i));
    return div;
  }

  // ── SLOT MODAL ───────────────────────────────────────────────────────────────
  function setupSlotModal() {
    document.getElementById('btnCloseSlot').onclick = closeSlotModal;
    document.getElementById('slotModal').addEventListener('click', e => {
      if (e.target === document.getElementById('slotModal')) closeSlotModal();
    });
    document.getElementById('btnSaveSlot').onclick  = saveSlot;
    document.getElementById('btnClearSlot').onclick = clearSlot;

    // Показываем чекбокс "отправить роль" когда роль выбрана
    document.getElementById('slotRole').addEventListener('change', () => {
      const hasRole = !!document.getElementById('slotRole').value;
      document.getElementById('sendRoleWrap').style.display = hasRole ? 'block' : 'none';
    });
  }

  function openSlotModal(i) {
    if (!isHostFlag) return;
    editIdx = i;
    const s = slots[i];
    document.getElementById('slotModalTitle').textContent = `Слот #${i+1}`;
    const sel = document.getElementById('slotLobbyPlayer');
    if (sel) {
      sel.innerHTML = '<option value="">— Нет привязки —</option>';
      lobbyPlayersRaw.forEach((p) => {
        if (!p.id) return;
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.nickname || 'Игрок';
        sel.appendChild(o);
      });
      sel.value = s.linkedUserId ? String(s.linkedUserId) : '';
    }
    document.getElementById('slotName').value   = s.name   || '';
    document.getElementById('slotRole').value   = s.role   || '';
    document.getElementById('slotVdo').value    = s.vdoUrl || '';
    document.getElementById('slotStatus').value = s.status || 'alive';
    const hasRole = !!s.role;
    document.getElementById('sendRoleWrap').style.display = hasRole ? 'block' : 'none';
    document.getElementById('sendRoleCheck').checked = true;
    document.getElementById('slotModal').classList.add('open');
  }

  function closeSlotModal() {
    document.getElementById('slotModal').classList.remove('open');
    editIdx = null;
  }

  async function saveSlot() {
    if (editIdx === null) return;
    const s = slots[editIdx];
    const oldRole = s.role;
    s.name   = document.getElementById('slotName').value.trim();
    s.role   = document.getElementById('slotRole').value;
    s.vdoUrl = document.getElementById('slotVdo').value.trim();
    s.status = document.getElementById('slotStatus').value;
    const bindId = document.getElementById('slotLobbyPlayer')?.value || null;
    s.linkedUserId = bindId || null;
    if (bindId) {
      const pl = lobbyPlayersRaw.find((p) => String(p.id) === String(bindId));
      if (pl && !s.name) s.name = pl.nickname || '';
    }
    await upsertPlayerMafiaSlot(editIdx, bindId);
    saveSlots();
    renderSlot(editIdx);
    renderHostPlayers();

    // Показ игроку через broadcast (если включено)
    const send = document.getElementById('sendRoleCheck').checked && s.role && s.role !== oldRole;
    if (send) sendRoleNotification(editIdx, s.role, s.name);

    closeSlotModal();
    toast(`Слот #${editIdx + 1} сохранён`, 'success');

    // Broadcast обновление слота всем
    broadcastSlotUpdate(editIdx);
  }

  async function clearSlot() {
    if (editIdx === null) return;
    await upsertPlayerMafiaSlot(editIdx, null);
    slots[editIdx] = defSlot();
    saveSlots();
    renderSlot(editIdx);
    renderHostPlayers();
    closeSlotModal();
    toast(`Слот #${editIdx+1} очищен`);
    broadcastSlotUpdate(editIdx);
  }

  // ── SIDEBARS ─────────────────────────────────────────────────────────────────
  function setupSidebars() {
    document.getElementById('btnLeaveLobby')?.addEventListener('click', () => {
      if (typeof leaveFromIndicator === 'function') leaveFromIndicator();
      else toast('Нет модуля выхода из комнаты', 'error');
    });
    document.getElementById('btnHostPanel').onclick = () => {
      if (!isHostFlag && !isRoomHost) return;
      toggleHost();
    };
    document.getElementById('btnCloseHost').onclick = () => { hostOpen = false; updateSidebars(); };

    document.querySelectorAll('.mf-stab').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.mf-stab').forEach((x) => x.classList.remove('active'));
        document.querySelectorAll('.mf-stab-panel').forEach((x) => { x.classList.add('hidden'); x.classList.remove('active'); });
        b.classList.add('active');
        const panel = document.getElementById(`stab-${b.dataset.stab}`);
        if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
      });
    });
  }

  function toggleHost() {
    hostOpen = !hostOpen;
    if (hostOpen) {
      updateHostPanelTabsVisibility();
      if (isHostFlag) renderHostPlayers();
    }
    updateSidebars();
  }

  function updateSidebars() {
    const hostSb = document.getElementById('hostSidebar');
    if (hostSb) hostSb.classList.toggle('hidden', !hostOpen);
    const btnHp = document.getElementById('btnHostPanel');
    if (btnHp) btnHp.classList.toggle('active', !!hostOpen);
  }

  // ── HOST CONTROLS ─────────────────────────────────────────────────────────────
  function setupHostControls() {
    document.querySelectorAll('.mf-phase-btn').forEach((b) => {
      b.addEventListener('click', () => {
        if (!isHostFlag) return;
        setPhase(b.dataset.phase, true);
      });
    });

    document.getElementById('btnTimerStart').onclick = () => {
      if (!isHostFlag) return;
      const sec = parseInt(document.getElementById('timerSec').value) || 60;
      startTimer(sec, true);
    };
    document.getElementById('btnTimerStop').onclick = () => {
      if (!isHostFlag) return;
      stopTimer(true);
    };

    document.getElementById('btnResetVotes').onclick = () => {
      if (!isHostFlag) return;
      slots.forEach(s => s.votes = 0); saveSlots(); renderGrid();
      toast('Голоса сброшены');
      broadcast({ type:'reset_votes' });
    };
    document.getElementById('btnReviveAll').onclick = () => {
      if (!isHostFlag) return;
      slots.forEach(s => { if(s.status==='dead') s.status='alive'; });
      saveSlots(); renderGrid(); renderHostPlayers();
      toast('Все воскрешены','success');
      broadcast({ type:'revive_all' });
    };
    document.getElementById('btnResetGame').onclick = () => {
      if (!isHostFlag) return;
      if (!confirm('Сбросить игру?')) return;
      slots = Array.from({length:TOTAL}, defSlot);
      saveSlots(); setPhase('wait', true); stopTimer(true); renderGrid(); renderHostPlayers();
      toast('Игра сброшена');
      broadcast({ type: 'slots_full_sync', snapshot: slots.map((x) => ({ ...x })) });
    };
    document.getElementById('btnRandEvent').onclick = () => {
      if (!isHostFlag) return;
      toggleRandEvent();
    };

    // Настройки
    document.getElementById('btnApplySlots').onclick = () => {
      if (!isHostFlag) return;
      activeSlots = Math.max(1, Math.min(12, parseInt(document.getElementById('settingSlots').value)||12));
      renderGrid(); saveSettings({ activeSlots });
    };
    document.getElementById('btnApplyGrid').onclick = () => {
      if (!isHostFlag) return;
      gridCols = parseInt(document.getElementById('settingGrid').value)||4;
      renderGrid(); saveSettings({ gridCols });
    };
    document.getElementById('settingRoom').addEventListener('input', (e) => {
      if (!isHostFlag) return;
      document.getElementById('roomName').textContent = e.target.value || 'Мафия';
      saveSettings({ roomName: e.target.value });
    });
  }

  function renderHostPlayers() {
    const list = document.getElementById('hostPlayersList');
    if (!list) return;
    list.innerHTML = '';
    for (let i = 0; i < activeSlots; i++) {
      const s = slots[i];
      const cfg = !!(s.name||s.vdoUrl);
      const row = ce('div','mf-prow');
      const rc  = ROLES_MAP[s.role] || 'other';
      row.innerHTML = `
        <span class="mf-prow__num">${i+1}</span>
        <span class="mf-prow__name">${esc(s.name)||'—'}</span>
        <span class="mf-prow__role mf-slot__role--${rc}">${s.role||''}</span>
        <span class="mf-prow__state mf-prow__state--${s.status}">${cfg?(STATUS_LBL[s.status]||''):''}</span>
      `;
      row.addEventListener('click', () => { if(isHostFlag) openSlotModal(i); });
      list.appendChild(row);
    }
    updateLobbyModerationUI();
  }

  function updateLobbyModerationUI() {
    const block = document.getElementById('mfLobbyModBlock');
    const list = document.getElementById('mfLobbyRosterList');
    if (!block || !list) return;
    const show = (isRoomHost || isHostFlag) && Array.isArray(lobbyPlayersRaw) && lobbyPlayersRaw.length > 0;
    block.classList.toggle('hidden', !show);
    if (!show) return;
    list.innerHTML = '';
    lobbyPlayersRaw.forEach((p) => {
      if (!p || p.id == null || String(p.id) === String(myUserId)) return;
      const row = document.createElement('div');
      row.className = 'mf-lobby-roster-row';
      const lb = typeof p.slot === 'number' ? ` · лобби #${p.slot + 1}` : '';
      const ms =
        p.mafia_slot != null && p.mafia_slot !== '' && !Number.isNaN(Number(p.mafia_slot))
          ? ` · сетка #${Number(p.mafia_slot) + 1}`
          : '';
      row.innerHTML = `<span class="mf-lobby-roster-name">${esc(p.nickname || 'Игрок')}${lb}${ms}</span>`;
      const bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'mf-btn mf-btn--dim mf-lobby-roster-kick';
      bt.textContent = 'Выгнать';
      bt.onclick = (e) => {
        e.stopPropagation();
        kickLobbyMember(p.id, p.nickname);
      };
      row.appendChild(bt);
      list.appendChild(row);
    });
  }

  async function kickLobbyMember(uid, nickname) {
    if (!(isRoomHost || isHostFlag)) return;
    if (!confirm(`Исключить «${nickname || 'игрока'}» из лобби?`)) return;
    if (!supabaseClient || !LOBBY) return;
    try {
      const pl = lobbyPlayersRaw.filter((p) => String(p.id) !== String(uid));
      await supabaseClient.from('lobbies').update({ players: pl }).eq('code', LOBBY);
      lobbyPlayersRaw = pl;
      rebuildLobbyPlayersMap(pl);
      applyLobbySlotBindings();
      renderGrid();
      renderHostPlayers();
      updatePresenterForm();
      toast('Игрок исключён из лобби', 'success');
    } catch (e) {
      toast('Не удалось исключить', 'error');
    }
  }

  // ── PHASE ────────────────────────────────────────────────────────────────────
  function setPhase(p, broadcast_=false) {
    phase = p;
    const info = PHASES[p]; if (!info) return;
    document.getElementById('phaseIcon').textContent = info.icon;
    document.getElementById('phaseText').textContent = info.text;
    Object.values(PHASES).forEach(ph => document.body.classList.remove(ph.css));
    document.body.classList.add(info.css);
    document.querySelectorAll('.mf-phase-btn').forEach(b => b.classList.toggle('active', b.dataset.phase===p));
    if (p === 'day' && randQueued) {
      randQueued = false;
      document.getElementById('btnRandEvent').classList.remove('mf-btn--blue');
      setTimeout(triggerRandEvent, 800);
    }
    if (broadcast_) broadcast({ type:'phase', phase:p });
  }

  // ── TIMER ────────────────────────────────────────────────────────────────────
  function startTimer(sec, broadcast_=false) {
    stopTimer();
    let rem = sec; updateTimer(rem);
    timerInt = setInterval(() => {
      rem--; updateTimer(rem);
      if (rem <= 0) { stopTimer(); toast('Время вышло!'); }
    }, 1000);
    if (broadcast_) broadcast({ type:'timer_start', seconds:sec });
  }
  function stopTimer(broadcast_=false) {
    if (timerInt) { clearInterval(timerInt); timerInt=null; }
    const el = $timerEl(); el.textContent=''; el.classList.remove('urgent');
    if (broadcast_) broadcast({ type:'timer_stop' });
  }
  function updateTimer(sec) {
    const el = $timerEl();
    const m = Math.floor(sec/60), s = sec%60;
    el.textContent = `${m}:${String(s).padStart(2,'0')}`;
    el.classList.toggle('urgent', sec<=10 && sec>0);
  }

  // ── RANDOM EVENT ──────────────────────────────────────────────────────────────
  function toggleRandEvent() {
    if (phase !== 'night') { toast('Только в фазе Ночь!','error'); return; }
    randQueued = !randQueued;
    document.getElementById('btnRandEvent').classList.toggle('mf-btn--blue', randQueued);
    toast(randQueued ? '🎲 Событие запланировано на утро!' : 'Событие отменено');
  }
  function triggerRandEvent() {
    const alive = slots.slice(0,activeSlots).map((s,i)=>({s,i})).filter(({s})=>s.status==='alive'&&(s.name||s.vdoUrl));
    if (!alive.length) { toast('Нет живых','error'); return; }
    for(let i=alive.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[alive[i],alive[j]]=[alive[j],alive[i]];}
    if (alive.length===1) { applyKill(alive[0].i); return; }
    setTimeout(()=>slotMsg(alive[0].i,'✅ ВЫЖИЛ ПРИ ОБСТРЕЛЕ!'),200);
    setTimeout(()=>applyKill(alive[1].i),1500);
  }
  function applyKill(i) {
    if (Math.random()<0.35) {
      slotMsg(i,'💫 СМЕРТЕЛЬНО РАНЕН, НО ВЫЖИЛ!');
    } else {
      slots[i].status='dead'; saveSlots(); renderSlot(i); renderHostPlayers();
      slotMsg(i,'💀 УБИТ!');
      broadcast({ type:'slot_update', idx:i, slot:slots[i] });
    }
  }
  function slotMsg(i, text) {
    const el = $grid().querySelector(`[data-i="${i}"]`); if (!el) return;
    const m = ce('div','mf-slot__msg'); m.textContent = text; el.appendChild(m);
    setTimeout(()=>{ m.classList.add('fade-out'); setTimeout(()=>m.remove(),800); },5000);
  }

  function sendRoleNotification(slotIdx, role, playerName) {
    broadcast({
      type: 'role_assign',
      slot: slotIdx,
      role,
      playerName: playerName || `Слот ${slotIdx + 1}`,
    });
    toast(`Роль «${role}» отправлена (${playerName || 'слот ' + (slotIdx + 1)})`, 'success');
  }

  // ── СИНХРОНИМАЦИЯ СТОЛА (Broadcast, без чата) ───────────────────────────────
  function initGameBroadcast() {
    const tryInit = (n) => {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        connectChannel();
      } else if (n > 0) {
        setTimeout(() => tryInit(n - 1), 500);
      }
    };
    tryInit(10);
  }

  function connectChannel() {
    if (!supabaseClient) return;
    rtChannel = supabaseClient.channel(CHANNEL);
    rtChannel
      .on('broadcast', { event: 'game' }, ({ payload }) => handlePayload(payload))
      .subscribe();
  }

  function broadcast(payload) {
    if (rtChannel) {
      rtChannel.send({ type:'broadcast', event:'game', payload });
    }
  }
  function broadcastSlotUpdate(i) {
    broadcast({ type:'slot_update', idx:i, slot:slots[i] });
  }

  function handlePayload(p) {
    if (!p || !p.type) return;
    switch (p.type) {
      case 'phase':
        setPhase(p.phase);
        break;
      case 'timer_start':
        startTimer(p.seconds);
        break;
      case 'timer_stop':
        stopTimer();
        break;
      case 'slot_update':
        if (typeof p.idx === 'number' && p.slot !== undefined) {
          slots[p.idx] = p.slot;
          saveSlots();
          renderSlot(p.idx);
          if (isHostFlag) renderHostPlayers();
          if (!isHostFlag && p.idx === mySlot) {
            if (slots[p.idx]?.role) showMyRole(slots[p.idx].role);
            else document.getElementById('myRoleWrap')?.classList.add('hidden');
          }
        }
        break;
      case 'role_assign':
        if (p.slot === mySlot && !isHostFlag) {
          openRoleReveal(p.role, '');
          showMyRole(p.role);
        }
        break;
      case 'reset_votes':
        slots.forEach(s => s.votes = 0); saveSlots(); renderGrid();
        break;
      case 'revive_all':
        slots.forEach(s => { if(s.status==='dead') s.status='alive'; });
        saveSlots(); renderGrid();
        break;
      case 'slots_full_sync':
        if (Array.isArray(p.snapshot) && p.snapshot.length === TOTAL && !isHostFlag) {
          slots = p.snapshot.map((x) => ({ ...defSlot(), ...x }));
          saveSlots();
          renderGrid();
          setupRoleUI();
        }
        break;
    }
  }

  // ── HOTKEYS ──────────────────────────────────────────────────────────────────
  function setupHotkeys() {
    // Секретный ввод «admin»
    let buf = '';
    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') { closeSlotModal(); }
      buf += e.key.toLowerCase();
      if (buf.length > 5) buf = buf.slice(-5);
      if (buf === 'admin') {
        buf = '';
        // Пробуем дать суперадмина через supabase если доступно
        if (typeof supabaseClient !== 'undefined' && supabaseClient && myUserId) {
          supabaseClient.from('profiles').update({ role:'superadmin' }).eq('id', myUserId)
            .then(({ error }) => {
              if (!error) toast('👑 Статус суперадмина получен!','success');
              else toast('Ошибка: ' + error.message,'error');
            });
        }
      }
    });
  }

  // ── STORAGE ──────────────────────────────────────────────────────────────────
  function defSlot() {
    return { name: '', vdoUrl: '', role: '', status: 'extinct', votes: 0, linkedUserId: null };
  }
  function loadSlots() {
    try {
      const raw = localStorage.getItem(slotsLsKey());
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length === TOTAL) return p.map((s) => ({ ...defSlot(), ...s }));
      }
    } catch {}
    return Array.from({length:TOTAL}, defSlot);
  }
  function saveSlots() { localStorage.setItem(slotsLsKey(), JSON.stringify(slots)); }

  function applySettings() {
    try {
      const s = JSON.parse(localStorage.getItem(settingsLsKey())||'{}');
      if (s.activeSlots) { activeSlots=s.activeSlots; document.getElementById('settingSlots').value=activeSlots; }
      if (s.gridCols)    { gridCols=s.gridCols;       document.getElementById('settingGrid').value=gridCols; }
      if (s.roomName)    { document.getElementById('roomName').textContent=s.roomName; document.getElementById('settingRoom').value=s.roomName; }
    } catch {}
  }
  function saveSettings(obj) {
    try {
      const cur = JSON.parse(localStorage.getItem(settingsLsKey())||'{}');
      Object.assign(cur, obj);
      localStorage.setItem(settingsLsKey(), JSON.stringify(cur));
    } catch {}
  }

  // ── VDO.NINJA ────────────────────────────────────────────────────────────────
  function vdoUrl(url) {
    url = url.trim();
    if (!url.startsWith('http')) {
      const id = url.replace(/[^a-zA-Z0-9_-]/g,'');
      return id ? `https://vdo.ninja/?view=${id}&cleanoutput&transparent` : '';
    }
    try {
      const u = new URL(url);
      if (u.searchParams.has('push')&&!u.searchParams.has('view')) {
        u.searchParams.set('view',u.searchParams.get('push')); u.searchParams.delete('push');
      }
      if (!u.searchParams.has('cleanoutput')) u.searchParams.set('cleanoutput','');
      return u.toString();
    } catch { return url; }
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  function ce(tag, cls) { const el = document.createElement(tag); el.className = cls; return el; }
  function esc(str) { return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function toast(msg, type='') {
    const t = $toast(); if (!t) return;
    t.textContent = msg; t.className = `toast show ${type}`;
    clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 2800);
  }

})();
