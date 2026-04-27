/**
 * LOBBY.JS — Страница лобби
 * URL: lobby.html?code=ABCDE
 */

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

  // Ждём авторизацию
  await new Promise(r => setTimeout(r, 300));

  if (!supabaseClient) {
    showError('Supabase не подключён', 'Проверь настройки');
    return;
  }

  // Проверяем авторизацию
  if (!currentUser) {
    // Показываем модальное окно входа
    openAuthModal('login');
    showToast('Войди чтобы зайти в лобби', 'error');
    // После входа перезагрузим
    const origOnSignedIn = window.onUserSignedIn || function(){};
    window.onUserSignedIn = function(user) {
      origOnSignedIn(user);
      initLobby();
    };
    return;
  }

  await initLobby();
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

    lobbyData = data;
    renderLobby(data);

  } catch (err) {
    console.error('[Lobby] Ошибка загрузки:', err);
  }
}

// ─── РЕНДЕР ───────────────────────────────────────────────────────────────────

function renderLobby(lobby) {
  const game   = GAMES_INFO[lobby.game] || GAMES_INFO.mafia;
  const maxP   = lobby.max_players || game.max;
  const players = Array.isArray(lobby.players) ? lobby.players : [];

  isHost = currentUser && lobby.host_id === currentUser.id;

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
  const myPlayer = players.find(p => p.id === currentUser?.id);
  isReady = myPlayer?.ready || false;
  updateReadyBtn();

  // Настройки — только хосту
  document.getElementById('hostSettings').classList.toggle('hidden', !isHost);
  document.getElementById('waitingCard').classList.toggle('hidden', isHost);

  // Заполняем форму настроек
  if (isHost) {
    document.getElementById('settingName').value = lobby.name || '';
    fillMaxPlayersSelect(lobby.game, maxP);
    document.getElementById('settingType').value = lobby.password ? 'private' : 'public';
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
}

function renderSlots(players, maxPlayers, hostId) {
  const wrap = document.getElementById('playerSlots');
  let html = '';

  // Заполненные слоты
  players.forEach(p => {
    const isMe      = p.id === currentUser?.id;
    const isHostP   = p.id === hostId;
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
  const idx = players.findIndex(p => p.id === currentUser.id);

  if (idx === -1) {
    players.push({ id: currentUser.id, nickname: currentUser.nickname, ready: isReady });
  } else {
    players[idx] = { ...players[idx], ready: isReady };
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
    await loadLobby();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

async function leaveLobby() {
  if (!supabaseClient || !lobbyData) {
    goBack();
    return;
  }

  clearInterval(pollInterval);

  if (isHost) {
    // Хост закрывает лобби
    if (confirm('Ты хост. Закрыть лобби для всех?')) {
      await supabaseClient.from('lobbies').update({ status: 'ended' }).eq('code', lobbyCode);
    }
  } else {
    // Убираем себя из списка игроков
    const players = (lobbyData.players || []).filter(p => p.id !== currentUser?.id);
    await supabaseClient.from('lobbies').update({ players }).eq('code', lobbyCode);
  }

  goBack();
}

async function kickPlayer(playerId, nickname) {
  if (!isHost || !confirm(`Исключить ${nickname}?`)) return;
  const players = (lobbyData.players || []).filter(p => p.id !== playerId);
  await supabaseClient.from('lobbies').update({ players }).eq('code', lobbyCode);
  showToast(`${nickname} исключён`, 'success');
  await loadLobby();
}

async function closeLobby() {
  if (!isHost || !confirm('Закрыть лобби для всех игроков?')) return;
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
  const sel = document.getElementById('settingMaxPlayers');
  if (sel.dataset.filled === game) return;
  sel.innerHTML = '';
  for (let i = gameInfo.min; i <= gameInfo.max; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i} игроков`;
    if (i === currentMax) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.dataset.filled = game;
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'settingType') togglePasswordField();
});

function togglePasswordField() {
  const type  = document.getElementById('settingType')?.value;
  const group = document.getElementById('passwordGroup');
  if (group) group.style.display = type === 'private' ? 'block' : 'none';
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

function goBack() {
  const game = lobbyData?.game;
  window.location.href = game ? `game.html?g=${game}` : 'index.html';
}

function showError(title, text) {
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
