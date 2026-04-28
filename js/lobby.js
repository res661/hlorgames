/**
 * LOBBY.JS — Страница лобби
 * URL: lobby.html?code=ABCDE
 */

// ─── КРАСИВЫЙ ДИАЛОГ ПОДТВЕРЖДЕНИЯ ───────────────────────────────────────────

function showConfirm({ title, text, okText = 'Подтвердить', danger = false, icon = '⚠️' }) {
  return new Promise((resolve) => {
    const dialog    = document.getElementById('confirmDialog');
    const titleEl   = document.getElementById('confirmTitle');
    const textEl    = document.getElementById('confirmText');
    const iconEl    = document.getElementById('confirmIcon');
    const okBtn     = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');

    if (!dialog) { resolve(window.confirm(text)); return; }

    titleEl.textContent = title;
    textEl.textContent  = text;
    iconEl.textContent  = icon;
    okBtn.textContent   = okText;
    okBtn.className     = `btn ${danger ? 'btn--danger-solid' : 'btn--primary'}`;

    dialog.classList.add('open');

    const cleanup = (result) => {
      dialog.classList.remove('open');
      okBtn.replaceWith(okBtn.cloneNode(true));
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      resolve(result);
      // Re-bind after clone
      document.getElementById('confirmOk').addEventListener('click', () => {});
    };

    const newOk = document.getElementById('confirmOk');
    const newCancel = document.getElementById('confirmCancel');
    newOk.onclick     = () => cleanup(true);
    newCancel.onclick = () => cleanup(false);
    dialog.onclick    = (e) => { if (e.target === dialog) cleanup(false); };
  });
}

const GAMES_INFO = {
  mafia:  { name: 'Мафия',   emoji: '🕵️', color: '#7c4dff', meta: '4–12 игроков · 30–60 мин', min: 4, max: 12 },
  bunker: { name: 'Бункер',  emoji: '🏚️', color: '#f59e0b', meta: '4–16 игроков · 20–40 мин', min: 4, max: 16 },
  alias:  { name: 'Алиас',   emoji: '🗣️', color: '#22c55e', meta: '4–20 игроков · 15–30 мин', min: 4, max: 20 },
};

let lobbyCode    = null;
let lobbyData    = null;
let pollInterval = null;
let isHost       = false;
let isReady      = false;

// ─── Слоты за столом (0 … seatT−1); порядок по очереди входа (см. lobby-seat-utils.js) ─

function lobbySeatCtx(row) {
  if (!row) return null;
  return { host_id: row.host_id, host_plays: row.host_plays !== false };
}

if (typeof window.LobbySeatUtils === 'undefined') {
  console.error('[Lobby] Подключи js/lobby-seat-utils.js перед lobby.js');
}

function dedupeLobbyPlayers(players) {
  return window.LobbySeatUtils.dedupeLobbyPlayers(players);
}

function normalizeLobbySlotsForSave(players, maxP, lobbyCtx) {
  return window.LobbySeatUtils.normalizeLobbySlotsForSave(players, maxP, lobbyCtx || null);
}

function countLobbyParticipants(players) {
  return dedupeLobbyPlayers(players).length;
}

function hostPlaysEnabled(lobby) {
  return lobby && lobby.host_plays !== false;
}

/** Число мест за столом в лобби: max_players + при «хост играет» */
function lobbySeatTotal(lobby) {
  const game = GAMES_INFO[lobby.game] || GAMES_INFO.mafia;
  const maxP = lobby.max_players || game.max;
  return maxP + (hostPlaysEnabled(lobby) ? 1 : 0);
}

async function persistLobbyPlayers(players, maxP) {
  const cleaned = normalizeLobbySlotsForSave(players, maxP, lobbySeatCtx(lobbyData));
  try {
    await supabaseClient.from('lobbies').update({ players: cleaned }).eq('code', lobbyCode);
    await loadLobby();
  } catch (err) {
    console.error('[Lobby] Ошибка сохранения слотов:', err);
    showToast('Не удалось обновить слоты', 'error');
  }
}

/** Плавающий чат (Supabase broadcast) */
let lobbyChatChannel     = null;
let lobbyRealtimeChannel = null;
let lobbyChatOpen      = false;
let lobbyChatUnread    = 0;
let lobbyChatInited    = false;

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  lobbyCode = params.get('code')?.toUpperCase();

  if (!lobbyCode) {
    showError('Код лобби не указан', 'Добавь ?code=XXXXX к URL');
    return;
  }

  // Привязываем auth кнопки
  document.getElementById('modalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });

  // Кнопки копирования
  document.getElementById('copyCodeBtn')?.addEventListener('click', () => copyText(lobbyCode, 'Код скопирован!'));
  document.getElementById('copyLinkBtn')?.addEventListener('click', () => copyText(window.location.href, 'Ссылка скопирована!'));

  // Ждём Supabase
  await new Promise(r => setTimeout(r, 400));

  if (!supabaseClient) {
    showError('Supabase не подключён', 'Проверь настройки');
    return;
  }

  // Ждём первого определения авторизации
  const startWhenReady = async () => {
    if (!currentUser) {
      openAuthModal('login');
      showToast('Войди чтобы зайти в лобби', 'error');
      window._onAuthUpdate = () => {
        if (currentUser) initLobby();
      };
      return;
    }
    await initLobby();
  };

  window._onAuthFirstLoad = startWhenReady;

  // Страховочный таймаут
  setTimeout(() => {
    if (window._onAuthFirstLoad) {
      window._onAuthFirstLoad = null;
      startWhenReady();
    }
  }, 1500);

  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted || !lobbyCode) return;
    loadLobby();
  });
});

async function initLobby() {
  await loadLobby();
  attachLobbyRealtime();
  pollInterval = setInterval(loadLobby, 12500);
}

function detachLobbyRealtime() {
  if (lobbyRealtimeChannel && supabaseClient?.removeChannel) {
    try {
      supabaseClient.removeChannel(lobbyRealtimeChannel);
    } catch (_) {}
    lobbyRealtimeChannel = null;
  }
}

function stopLobbyTimers() {
  if (pollInterval != null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  detachLobbyRealtime();
}

function attachLobbyRealtime() {
  if (!supabaseClient || !lobbyCode) return;
  detachLobbyRealtime();
  const chName = `lobby_row:${String(lobbyCode).replace(/[^\w]/g, '_')}`;
  try {
    lobbyRealtimeChannel = supabaseClient
      .channel(chName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `code=eq.${lobbyCode}` },
        () => {
          loadLobby();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') console.warn('[Lobby] Realtime недоступен (включи Replication для lobbies в Supabase)');
      });
  } catch (e) {
    console.warn('[Lobby] realtime', e);
  }
}

// ─── ЗАГРУЗКА ЛОББИ ──────────────────────────────────────────────────────────

async function loadLobby() {
  try {
    const { data, error } = await supabaseClient
      .from('lobbies')
      .select('*')
      .eq('code', lobbyCode)
      .single();

    if (error || !data) {
      stopLobbyTimers();
      showError('Лобби не найдено', 'Оно было закрыто или код неверный');
      return;
    }

    lobbyData = await syncMyLobbyIdentity(data);
    renderLobby(lobbyData);
    // Сохраняем в localStorage для индикатора (код нормализуется в setActiveLobby)
    if (typeof setActiveLobby === 'function' && data.status === 'waiting') {
      setActiveLobby(data.code, data.game, data.name || data.code);
    }

  } catch (err) {
    console.error('[Lobby] Ошибка загрузки:', err);
  }
}

// ─── СИНХРОНИЗАЦИЯ НИКА С ПРОФИЛЕМ В КОМНАТЕ ─────────────────────────────────

async function syncMyLobbyIdentity(data) {
  if (!currentUser || !supabaseClient || !data) return data;
  try {
    const players = [...(data.players || [])];
    let host_name = data.host_name;
    let changed   = false;
    const i = players.findIndex(p => String(p.id) === String(currentUser.id));
    if (i >= 0 && players[i].nickname !== currentUser.nickname) {
      players[i] = { ...players[i], nickname: currentUser.nickname };
      changed = true;
    }
    if (String(data.host_id) === String(currentUser.id) && host_name !== currentUser.nickname) {
      host_name = currentUser.nickname;
      changed = true;
    }
    if (!changed) return data;
    const { error } = await supabaseClient
      .from('lobbies')
      .update({ players, host_name })
      .eq('code', data.code);
    if (error) return data;
    return { ...data, players, host_name };
  } catch {
    return data;
  }
}

// ─── РЕНДЕР ───────────────────────────────────────────────────────────────────

function renderLobby(lobby) {
  const game   = GAMES_INFO[lobby.game] || GAMES_INFO.mafia;
  const maxP   = lobby.max_players || game.max;
  const players = Array.isArray(lobby.players) ? lobby.players : [];

  isHost = !!(currentUser && String(lobby.host_id) === String(currentUser.id));

  // Обновляем цвет темы
  document.documentElement.style.setProperty('--game-color', game.color);

  // Топбар
  document.title = `${lobby.name || lobbyCode} — HlorGames`;
  document.getElementById('topbarEmoji').textContent  = game.emoji;
  document.getElementById('topbarGame').textContent   = game.name;
  document.getElementById('topbarCode').textContent   = lobby.code;
  document.getElementById('shareLobbyCode').textContent = lobby.code;

  // Инфо
  document.getElementById('gameLogoEmoji').textContent = game.emoji;
  document.getElementById('infoGameName').textContent  = game.name;
  document.getElementById('infoGameMeta').textContent  = game.meta;
  document.getElementById('detailName').textContent    = lobby.name || lobby.code;
  document.getElementById('detailHost').textContent    = lobby.host_name || '—';
  document.getElementById('detailType').textContent    = lobby.password ? '🔒 С паролем' : '🌍 Публичное';
  document.getElementById('detailStatus').innerHTML    = statusBadge(lobby.status);
  document.getElementById('detailCreated').textContent = fmtDate(lobby.created_at);

  const playersRaw = Array.isArray(lobby.players) ? lobby.players : [];
  const seatT = lobbySeatTotal(lobby);
  const playersNorm = normalizeLobbySlotsForSave(playersRaw, seatT, lobbySeatCtx(lobby));
  const seatedCount = playersNorm.filter(p => p.slot != null).length;
  document.getElementById('playerCount').textContent =
    `${seatedCount}/${seatT} за столом · ${playersNorm.length} в комнате`;

  renderSlots(lobby);

  // Кнопка "Начать игру" — только хосту
  const startBtn = document.getElementById('startBtn');
  if (isHost && lobby.status === 'waiting') {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }

  // Кнопка готовности
  const myPlayer = playersNorm.find(p => String(p.id) === String(currentUser?.id));
  isReady = myPlayer?.ready || false;
  updateReadyBtn();

  // Настройки — только хосту
  document.getElementById('hostSettings').classList.toggle('hidden', !isHost);
  document.getElementById('waitingCard').classList.toggle('hidden', isHost);

  // Заполняем форму настроек
  if (isHost) {
    document.getElementById('settingName').value = lobby.name || '';
    fillMaxPlayersSelect(lobby.game, maxP);
    initTypeSelect();
    const typeVal = lobby.password ? 'private' : 'public';
    const typeHidden = document.getElementById('settingType');
    const typeLabel  = document.getElementById('settingTypeLabel');
    const typeDropdown = document.getElementById('settingTypeDropdown');
    if (typeHidden) { typeHidden.value = typeVal; }
    if (typeLabel) { typeLabel.textContent = typeVal === 'private' ? '🔒 По паролю' : '🌍 Публичное'; }
    if (typeDropdown) {
      typeDropdown.querySelectorAll('.custom-select__item').forEach(el => {
        el.classList.toggle('active', el.dataset.value === typeVal);
      });
    }
    document.getElementById('settingPassword').value = lobby.password || '';
    togglePasswordField();
  }

  document.getElementById('lbGoGamePanel')?.classList.toggle('hidden', lobby.status !== 'active' || lobby.game !== 'mafia');
  const goLink = document.getElementById('lbGoGameLink');
  if (goLink && lobby.game === 'mafia') {
    goLink.href = `mafia-play.html?code=${encodeURIComponent(String(lobby.code || lobbyCode || ''))}`;
  }

  // Статус бар
  const seatedForReady = playersNorm.filter(p => p.slot != null).length;
  const readyCount = playersNorm.filter(p => p.ready && p.slot != null).length;
  const statusEl   = document.getElementById('statusText');
  if (lobby.status === 'waiting') {
    statusEl.textContent = `${readyCount} из ${seatedForReady} за столом готовы`;
  } else if (lobby.status === 'active') {
    statusEl.textContent = '🎮 Игра началась!';
  }

  // Показываем контент
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('lobbyLayout').classList.remove('hidden');

  document.getElementById('lobbyChatWidget')?.classList.remove('hidden');
  initLobbyChatOnce();
  rerenderLobbyChatNicknames();
}

function renderSlots(lobby) {
  const game   = GAMES_INFO[lobby.game] || GAMES_INFO.mafia;
  const seatT  = lobbySeatTotal(lobby);
  const maxP   = lobby.max_players || game.max;
  const hostPlays = hostPlaysEnabled(lobby);
  const hostId = lobby.host_id;
  const players = normalizeLobbySlotsForSave(lobby.players || [], seatT, lobbySeatCtx(lobby));
  const wrap = document.getElementById('playerSlots');
  if (!wrap) return;

  let html = '';

  for (let i = 0; i < seatT; i++) {
    const p = players.find(x => x.slot === i);
    const isHostBench = hostPlays && i === maxP;
    if (p) {
      const isMe      = String(p.id) === String(currentUser?.id);
      const isHostP   = String(p.id) === String(hostId);
      const initials  = (p.nickname || '?')[0].toUpperCase();
      const readyMark = p.ready ? 'lb-slot--ready' : '';
      const pickable  = false;
      const busyOther = !isMe;
      const cls = [
        'lb-slot',
        'lb-slot--filled',
        readyMark,
        isMe ? 'lb-slot--me' : '',
        busyOther ? 'lb-slot--locked' : '',
      ].filter(Boolean).join(' ');

      const kickHtml = (isHost && !isMe)
        ? `<button type="button" class="lb-kick-btn" data-kick="${String(p.id).replace(/"/g, '&quot;')}" title="Исключить">✕</button>`
        : '';
      const clearHtml = (isHost && !isMe)
        ? `<button type="button" class="lb-slot-clear-btn" data-clear-slot="${i}" title="Снять со слота — места пересчитаются автоматически">Со слота</button>`
        : '';

      html += `
        <div class="${cls}" data-lobby-slot-index="${i}">
          <span class="lb-slot-num">${i + 1}</span>
          <div class="lb-slot-avatar" style="background:${strToColor(p.id || p.nickname)}">${initials}</div>
          <div class="lb-slot-info">
            <span class="lb-slot-name">${esc(p.nickname || 'Игрок')}</span>
            <span class="lb-slot-status">${isHostBench ? 'Вне сетки камер · ' : ''}${isHostP ? '👑 Хост' : (p.ready ? '✓ Готов' : 'Не готов')}</span>
          </div>
          ${clearHtml}
          ${kickHtml}
          ${p.ready ? '<span class="lb-ready-dot"></span>' : ''}
        </div>`;
    } else {
      const emptyLabel = isHostBench ? 'Место хоста (+1)' : 'Свободно';
      const emptySub = isHostBench
        ? (isHost ? 'Спецместо без окна камеры в мафии' : 'Только если хост играет')
        : (isHost ? 'Порядок: кто зашёл 1-й, 2-й…' : 'Подожди свой номер');
      html += `
        <div class="lb-slot lb-slot--empty ${isHostBench ? 'lb-slot--host-bench' : ''}" data-lobby-slot-index="${i}">
          <span class="lb-slot-num">${i + 1}</span>
          <div class="lb-slot-avatar lb-slot-avatar--empty">+</div>
          <div class="lb-slot-info">
            <span class="lb-slot-empty-text">${emptyLabel}</span>
            <span class="lb-slot-status">${emptySub}</span>
          </div>
        </div>`;
    }
  }

  const unseated = players.filter(p => p.slot == null);
  if (unseated.length) {
    html += `<div class="lb-unseated-banner">
      <div class="lb-unseated-banner__title">В комнате, но не за столом</div>
      <div class="lb-unseated-banner__names">${unseated.map(u => esc(u.nickname || 'Игрок')).join(' · ')}</div>
    </div>`;
  }

  wrap.innerHTML = html;

  wrap.querySelectorAll('[data-kick]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-kick');
      const pl = (lobbyData?.players || []).find(p => String(p.id) === String(id));
      kickPlayer(id, pl?.nickname || 'Игрок');
    });
  });
  wrap.querySelectorAll('[data-clear-slot]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-clear-slot'), 10);
      hostClearSlotFromLobby(idx);
    });
  });
}

async function hostClearSlotFromLobby(slotIndex) {
  if (!isHost || !lobbyData) return;
  const seatT = lobbySeatTotal(lobbyData);
  const players = normalizeLobbySlotsForSave([...(lobbyData.players || [])], seatT, lobbySeatCtx(lobbyData));
  const p = players.find(x => x.slot === slotIndex);
  if (!p) return;
  p.slot = null;
  p.ready = false;
  const reindexed = normalizeLobbySlotsForSave(players, seatT, lobbySeatCtx(lobbyData));
  await persistLobbyPlayers(reindexed, seatT);
}

// ─── ДЕЙСТВИЯ ────────────────────────────────────────────────────────────────

async function toggleReady() {
  if (!currentUser || !lobbyData) return;
  const seatT = lobbySeatTotal(lobbyData);
  const players = normalizeLobbySlotsForSave([...(lobbyData.players || [])], seatT, lobbySeatCtx(lobbyData));
  const idx = players.findIndex(p => String(p.id) === String(currentUser.id));

  if (idx === -1) return;
  if (players[idx].slot == null) {
    const hid = lobbyData.host_id != null ? String(lobbyData.host_id) : '';
    const judgesOnlyHost = hid && String(currentUser.id) === hid && lobbyData.host_plays === false;
    showToast(judgesOnlyHost ? 'Режим «только ведущий»: ты не занимаешь место за столом.' : 'Ожди назначение места по очереди входа.', 'error');
    return;
  }

  isReady = !players[idx].ready;
  players[idx] = { ...players[idx], nickname: currentUser.nickname, ready: isReady };
  updateReadyBtn();

  try {
    const cleaned = normalizeLobbySlotsForSave(players, seatT, lobbySeatCtx(lobbyData));
    await supabaseClient.from('lobbies').update({ players: cleaned }).eq('code', lobbyCode);
    await loadLobby();
  } catch (err) {
    console.error('[Lobby] Ошибка ready:', err);
  }
}

function updateReadyBtn() {
  const btn = document.getElementById('readyBtn');
  if (!lobbyData || !currentUser) return;
  const seatT = lobbySeatTotal(lobbyData);
  const players = normalizeLobbySlotsForSave(lobbyData.players || [], seatT, lobbySeatCtx(lobbyData));
  const me = players.find(p => String(p.id) === String(currentUser.id));
  const hasSeat = me && me.slot != null;

  const judgesOnlySelf = lobbyData.host_plays === false &&
    lobbyData.host_id && String(currentUser.id) === String(lobbyData.host_id);

  if (lobbyData.status === 'waiting' && me && !hasSeat) {
    btn.disabled = true;
    btn.title = judgesOnlySelf ? 'Ведущий без места за столом' : 'Место назначается автоматически по очереди входа';
  } else {
    btn.disabled = false;
    btn.title = '';
  }

  if (isReady) {
    btn.textContent = '✓ Готов';
    btn.classList.add('lb-ready-btn--active');
  } else {
    btn.textContent = '○ Не готов';
    btn.classList.remove('lb-ready-btn--active');
  }
}

async function startGame() {
  if (!isHost) return;
  try {
    await supabaseClient.from('lobbies').update({ status: 'active' }).eq('code', lobbyCode);
    showToast('Игра началась! 🎮', 'success');

    // Определяем игру и ведём хоста на игровую страницу
    const game = lobbyData?.game || 'mafia';
    if (game === 'mafia') {
      stopLobbyTimers();
      window.location.href = `mafia-play.html?code=${lobbyCode}&role=host`;
    } else {
      await loadLobby();
    }
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

// ← Назад: уходим со страницы, НО остаёмся в лобби (индикатор остаётся)
function exitLobbyPage() {
  stopLobbyTimers();
  // Индикатор НЕ очищаем — пользователь всё ещё в лобби
  goBack();
}

// Покинуть лобби: убираем из лобби И уходим со страницы
async function leaveAndExit() {
  const ok = await showConfirm(isHost
    ? { title: 'Закрыть лобби', text: 'Ты хост. Лобби закроется для всех участников.', okText: 'Закрыть', danger: true, icon: '🚪' }
    : { title: 'Покинуть лобби', text: 'Ты уйдёшь из комнаты. Вернуться можно по коду.', okText: 'Покинуть', danger: true, icon: '🚪' }
  );
  if (!ok) return;

  if (typeof clearActiveLobby === 'function') clearActiveLobby();
  stopLobbyTimers();

  if (!supabaseClient || !lobbyData) { goBack(); return; }

  if (isHost) {
    await supabaseClient.from('lobbies').update({ status: 'ended' }).eq('code', lobbyCode);
  } else {
    const players = (lobbyData.players || []).filter(p => String(p.id) !== String(currentUser?.id));
    await supabaseClient.from('lobbies').update({ players }).eq('code', lobbyCode);
  }

  goBack();
}

// Совместимость — старый вызов
async function leaveLobby() { await leaveAndExit(); }

async function kickPlayer(playerId, nickname) {
  if (!isHost) return;
  const ok = await showConfirm({
    title: 'Исключить игрока',
    text: `Исключить «${esc(String(nickname || ''))}» из лобби?`,
    okText: 'Исключить',
    danger: true,
    icon: '👢',
  });
  if (!ok) return;
  const players = (lobbyData.players || []).filter(p => String(p.id) !== String(playerId));
  await supabaseClient.from('lobbies').update({ players }).eq('code', lobbyCode);
  showToast(`${nickname} исключён`, 'success');
  await loadLobby();
}

async function closeLobby() {
  if (!isHost) return;
  const ok = await showConfirm({ title: 'Закрыть лобби', text: 'Закрыть лобби для всех игроков? Это нельзя отменить.', okText: 'Закрыть', danger: true, icon: '🔴' });
  if (!ok) return;
  if (typeof clearActiveLobby === 'function') clearActiveLobby();
  stopLobbyTimers();
  await supabaseClient.from('lobbies').update({ status: 'ended' }).eq('code', lobbyCode);
  showToast('Лобби закрыто', 'success');
  goBack();
}

async function saveSettings() {
  if (!isHost) return;

  const name       = document.getElementById('settingName').value.trim() || lobbyCode;
  const maxPlayers = parseInt(document.getElementById('settingMaxPlayers').value);
  const type       = document.getElementById('settingType').value;
  const password   = type === 'private' ? document.getElementById('settingPassword').value.trim() : null;
  const hostPlays = false;

  const tmpLobby = { ...lobbyData, max_players: maxPlayers, host_plays: hostPlays };
  const seatT    = lobbySeatTotal(tmpLobby);

  const ctxRow = { ...lobbyData, host_plays: hostPlays };
  let players = normalizeLobbySlotsForSave([...(lobbyData.players || [])], seatT, lobbySeatCtx(ctxRow));
  players.forEach((p) => {
    if (typeof p.slot === 'number' && p.slot >= seatT) p.slot = null;
  });
  players = normalizeLobbySlotsForSave(players, seatT, lobbySeatCtx(ctxRow));

  try {
    await supabaseClient.from('lobbies')
      .update({ name, max_players: maxPlayers, password, host_plays: hostPlays, players })
      .eq('code', lobbyCode);
    showToast('Настройки сохранены', 'success');
    await loadLobby();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

// ─── НАСТРОЙКИ ФОРМЫ ─────────────────────────────────────────────────────────

function fillMaxPlayersSelect(game, currentMax) {
  const gameInfo = GAMES_INFO[game] || { min: 4, max: 12 };
  const hidden   = document.getElementById('settingMaxPlayers');
  const dropdown = document.getElementById('settingMaxPlayersDropdown');
  const label    = document.getElementById('settingMaxPlayersLabel');
  const btn      = document.getElementById('settingMaxPlayersBtn');
  const wrap     = document.getElementById('settingMaxPlayersWrap');
  if (!dropdown || wrap.dataset.filled === game) return;

  dropdown.innerHTML = '';
  for (let i = gameInfo.min; i <= gameInfo.max; i++) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-select__item' + (i === currentMax ? ' active' : '');
    item.textContent = `${i} игроков`;
    item.dataset.value = i;
    item.onclick = () => {
      hidden.value = i;
      label.textContent = `${i} игроков`;
      dropdown.querySelectorAll('.custom-select__item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      wrap.classList.remove('open');
    };
    dropdown.appendChild(item);
  }
  hidden.value = currentMax;
  label.textContent = `${currentMax} игроков`;
  wrap.dataset.filled = game;

  btn.onclick = (e) => { e.stopPropagation(); wrap.classList.toggle('open'); };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); }, { once: false });
}

function initTypeSelect() {
  const wrap     = document.getElementById('settingTypeWrap');
  const hidden   = document.getElementById('settingType');
  const label    = document.getElementById('settingTypeLabel');
  const btn      = document.getElementById('settingTypeBtn');
  const dropdown = document.getElementById('settingTypeDropdown');
  if (!wrap || wrap.dataset.init) return;
  wrap.dataset.init = '1';

  dropdown.querySelectorAll('.custom-select__item').forEach(item => {
    item.onclick = () => {
      hidden.value = item.dataset.value;
      label.textContent = item.textContent;
      dropdown.querySelectorAll('.custom-select__item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      wrap.classList.remove('open');
      togglePasswordField();
    };
  });
  btn.onclick = (e) => { e.stopPropagation(); wrap.classList.toggle('open'); };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
}

function togglePasswordField() {
  const type  = document.getElementById('settingType')?.value;
  const group = document.getElementById('passwordGroup');
  if (group) group.style.display = type === 'private' ? 'block' : 'none';
}

// ─── ЧАТ ЛОББИ (мини-окно, broadcast) ─────────────────────────────────────────

function lobbyChatDisplayName(uid, hintNick) {
  if (!uid) return hintNick || 'Игрок';
  if (currentUser && String(uid) === String(currentUser.id)) return currentUser.nickname || 'Ты';
  const pl = (lobbyData?.players || []).find(p => String(p.id) === String(uid));
  return pl?.nickname || hintNick || 'Игрок';
}

function trimLobbyChatDom() {
  const wrap = document.getElementById('lobbyChatMsgs');
  while (wrap && wrap.children.length > 200) wrap.removeChild(wrap.firstChild);
}

function scrollLobbyChatBottom() {
  const wrap = document.getElementById('lobbyChatMsgs');
  if (wrap) requestAnimationFrame(() => { wrap.scrollTop = wrap.scrollHeight; });
}

function updateLobbyChatBadge() {
  const b = document.getElementById('lobbyChatBadge');
  if (!b) return;
  if (lobbyChatUnread > 0) {
    b.textContent = lobbyChatUnread > 99 ? '99+' : String(lobbyChatUnread);
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

function appendLobbyChatMessage(uid, text, ts, hintNick, isMine) {
  const wrap = document.getElementById('lobbyChatMsgs');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'lb-chat-msg' + (isMine ? ' lb-chat-msg--mine' : '');
  if (uid) div.dataset.uid = uid;
  const from = lobbyChatDisplayName(uid, hintNick);
  const time = new Date(ts || Date.now()).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <div class="lb-chat-msg__head">
      <span class="lb-chat-msg__from">${esc(from)}</span>
      <span class="lb-chat-msg__time">${time}</span>
    </div>
    <div class="lb-chat-msg__text">${esc(text)}</div>
  `;
  wrap.appendChild(div);
  trimLobbyChatDom();
  scrollLobbyChatBottom();
}

function rerenderLobbyChatNicknames() {
  document.querySelectorAll('#lobbyChatMsgs .lb-chat-msg[data-uid]').forEach((el) => {
    const uid = el.dataset.uid;
    const fromEl = el.querySelector('.lb-chat-msg__from');
    if (!fromEl || !uid) return;
    fromEl.textContent = lobbyChatDisplayName(uid, '');
  });
}

async function loadLobbyChatFromDb() {
  if (!supabaseClient || !lobbyCode) return;
  try {
    const { data, error } = await supabaseClient.from('lobbies').select('lobby_chat').eq('code', lobbyCode).maybeSingle();
    if (error) return;
    const arr = Array.isArray(data?.lobby_chat) ? data.lobby_chat : [];
    const wrap = document.getElementById('lobbyChatMsgs');
    if (!wrap) return;
    wrap.innerHTML = '';
    arr.forEach((m) => {
      if (m.kind === 'msg' && m.text) {
        appendLobbyChatMessage(m.uid, m.text, m.ts, m.nick, String(m.uid) === String(currentUser?.id));
      }
    });
    scrollLobbyChatBottom();
  } catch (_) {}
}

async function persistLobbyChatRow(uid, text, nick) {
  if (!supabaseClient || !lobbyCode) return;
  try {
    const { data } = await supabaseClient.from('lobbies').select('lobby_chat').eq('code', lobbyCode).maybeSingle();
    const arr = Array.isArray(data?.lobby_chat) ? data.lobby_chat : [];
    arr.push({ kind: 'msg', uid, text, ts: Date.now(), nick: nick || null });
    await supabaseClient.from('lobbies').update({ lobby_chat: arr.slice(-250) }).eq('code', lobbyCode);
  } catch (e) {
    console.warn('[lobby] lobby_chat', e);
  }
}

function initLobbyChatOnce() {
  if (lobbyChatInited || !supabaseClient || !lobbyCode || !currentUser) return;

  const fab   = document.getElementById('lobbyChatFab');
  const panel = document.getElementById('lobbyChatPanel');
  const minBtn = document.getElementById('lobbyChatMinimize');
  const send  = document.getElementById('lobbyChatSend');
  const input = document.getElementById('lobbyChatInput');
  if (!fab || !panel || !send || !input || !minBtn) return;

  lobbyChatInited = true;

  function openPanel() {
    lobbyChatOpen = true;
    panel.classList.remove('hidden');
    lobbyChatUnread = 0;
    updateLobbyChatBadge();
    scrollLobbyChatBottom();
    input.focus();
  }

  function closePanel() {
    lobbyChatOpen = false;
    panel.classList.add('hidden');
  }

  fab.addEventListener('click', () => {
    if (panel.classList.contains('hidden')) openPanel();
    else closePanel();
  });
  minBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  function postLobbyChat() {
    const text = input.value.trim();
    if (!text || !currentUser) return;
    const ts = Date.now();
    const payload = { type: 'chat', uid: currentUser.id, text, ts, nick: currentUser.nickname };
    appendLobbyChatMessage(currentUser.id, text, ts, currentUser.nickname, true);
    input.value = '';
    persistLobbyChatRow(currentUser.id, text, currentUser.nickname);
    if (lobbyChatChannel) {
      lobbyChatChannel.send({ type: 'broadcast', event: 'msg', payload });
    }
    scrollLobbyChatBottom();
  }

  send.addEventListener('click', postLobbyChat);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      postLobbyChat();
    }
  });

  (async () => {
    await loadLobbyChatFromDb();
    const chName = `lobby_chat:${lobbyCode}`;
    lobbyChatChannel = supabaseClient.channel(chName, { config: { broadcast: { self: false } } });
    lobbyChatChannel
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        if (!payload || payload.type !== 'chat' || !payload.text) return;
        appendLobbyChatMessage(payload.uid, payload.text, payload.ts, payload.nick, false);
        if (!lobbyChatOpen) {
          lobbyChatUnread++;
          updateLobbyChatBadge();
        }
      })
      .subscribe();
  })();
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

function goBack() {
  const game = lobbyData?.game;
  window.location.href = game ? `game.html?g=${game}` : 'index.html';
}

function showError(title, text) {
  document.getElementById('lobbyChatWidget')?.classList.add('hidden');
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('lobbyLayout').classList.add('hidden');
  document.getElementById('errorScreen').classList.remove('hidden');
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorText').textContent  = text;
}

function statusBadge(status) {
  const map = {
    waiting: '<span style="color:#22c55e;font-weight:600">● Ожидание</span>',
    active:  '<span style="color:#60a5fa;font-weight:600">▶ Идёт игра</span>',
    ended:   '<span style="color:#888;font-weight:600">■ Завершено</span>',
  };
  return map[status] || status;
}

function strToColor(str) {
  const colors = ['#7c4dff','#f59e0b','#22c55e','#ef4444','#60a5fa','#e040fb','#14b8a6','#f97316'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(msg, 'success');
  } catch {
    showToast('Не удалось скопировать', 'error');
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
