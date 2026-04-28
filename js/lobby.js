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

/** Плавающий чат (Supabase broadcast) */
let lobbyChatChannel   = null;
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
});

async function initLobby() {
  await loadLobby();
  // Автообновление каждые 4 секунды
  pollInterval = setInterval(loadLobby, 4000);
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
      clearInterval(pollInterval);
      showError('Лобби не найдено', 'Оно было закрыто или код неверный');
      return;
    }

    lobbyData = await syncMyLobbyIdentity(data);
    renderLobby(lobbyData);
    // Сохраняем в localStorage для индикатора
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
  document.getElementById('playerCount').textContent   = `${players.length}/${maxP}`;

  // Слоты игроков
  renderSlots(players, maxP, lobby.host_id);

  // Кнопка "Начать игру" — только хосту
  const startBtn = document.getElementById('startBtn');
  if (isHost && lobby.status === 'waiting') {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }

  // Кнопка готовности
  const myPlayer = players.find(p => String(p.id) === String(currentUser?.id));
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

  // Статус бар
  const readyCount = players.filter(p => p.ready).length;
  const statusEl   = document.getElementById('statusText');
  if (lobby.status === 'waiting') {
    statusEl.textContent = `${readyCount} из ${players.length} готовы`;
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

function renderSlots(players, maxPlayers, hostId) {
  const wrap = document.getElementById('playerSlots');
  let html = '';

  // Заполненные слоты
  players.forEach(p => {
    const isMe      = String(p.id) === String(currentUser?.id);
    const isHostP   = String(p.id) === String(hostId);
    const initials  = (p.nickname || '?')[0].toUpperCase();
    const readyMark = p.ready ? 'lb-slot--ready' : '';

    html += `
      <div class="lb-slot ${readyMark} ${isMe ? 'lb-slot--me' : ''}">
        <div class="lb-slot-avatar" style="background:${strToColor(p.id || p.nickname)}">${initials}</div>
        <div class="lb-slot-info">
          <span class="lb-slot-name">${esc(p.nickname || 'Игрок')}</span>
          <span class="lb-slot-status">${isHostP ? '👑 Хост' : (p.ready ? '✓ Готов' : 'Не готов')}</span>
        </div>
        ${isMe ? '' : isHost ? `<button class="lb-kick-btn" onclick="kickPlayer('${p.id}','${esc(p.nickname)}')" title="Исключить">✕</button>` : ''}
        ${p.ready ? '<span class="lb-ready-dot"></span>' : ''}
      </div>
    `;
  });

  // Пустые слоты
  for (let i = players.length; i < maxPlayers; i++) {
    html += `
      <div class="lb-slot lb-slot--empty">
        <div class="lb-slot-avatar lb-slot-avatar--empty">+</div>
        <span class="lb-slot-empty-text">Свободный слот</span>
      </div>
    `;
  }

  wrap.innerHTML = html;
}

// ─── ДЕЙСТВИЯ ────────────────────────────────────────────────────────────────

async function toggleReady() {
  if (!currentUser || !lobbyData) return;
  isReady = !isReady;

  const players = Array.isArray(lobbyData.players) ? [...lobbyData.players] : [];
  const idx = players.findIndex(p => String(p.id) === String(currentUser.id));

  if (idx === -1) {
    players.push({ id: currentUser.id, nickname: currentUser.nickname, ready: isReady });
  } else {
    players[idx] = { ...players[idx], nickname: currentUser.nickname, ready: isReady };
  }

  updateReadyBtn();

  try {
    await supabaseClient.from('lobbies').update({ players }).eq('code', lobbyCode);
    await loadLobby();
  } catch (err) {
    console.error('[Lobby] Ошибка ready:', err);
  }
}

function updateReadyBtn() {
  const btn = document.getElementById('readyBtn');
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
      clearInterval(pollInterval);
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
  clearInterval(pollInterval);
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
  clearInterval(pollInterval);

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
    text: `Исключить «${nickname}» из лобби?`,
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

  try {
    await supabaseClient.from('lobbies')
      .update({ name, max_players: maxPlayers, password })
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
    if (!text || !currentUser || !lobbyChatChannel) return;
    const ts = Date.now();
    const payload = { type: 'chat', uid: currentUser.id, text, ts, nick: currentUser.nickname };
    appendLobbyChatMessage(currentUser.id, text, ts, currentUser.nickname, true);
    input.value = '';
    lobbyChatChannel.send({ type: 'broadcast', event: 'msg', payload });
    scrollLobbyChatBottom();
  }

  send.addEventListener('click', postLobbyChat);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      postLobbyChat();
    }
  });

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
