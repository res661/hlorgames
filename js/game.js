/**
 * GAME.JS — Страница игры: создание лобби, активные и завершённые комнаты
 * URL: game.html?g=mafia | game.html?g=bunker | game.html?g=alias
 */

// ─── ДАННЫЕ ОБ ИГРАХ ─────────────────────────────────────────────────────────

const GAMES = {
  mafia: {
    name:       'Мафия',
    emoji:      '🕵️',
    color:      '#7c4dff',
    desc:       'Классическая игра на дедукцию. Мирные жители против мафии — роли, ночные убийства, дневные голосования.',
    meta:       '👥 4–12 игроков · ⏱ 30–60 мин',
    minPlayers: 4,
    maxPlayers: 12,
    defaultMax: 8,
    rules: [
      'Ведущий раздаёт роли: мафия, мирные, шериф, доктор',
      'Ночью мафия выбирает жертву, шериф проверяет игрока, доктор лечит',
      'Днём все обсуждают и голосуют кого исключить',
      'Победа мирных — исключить всю мафию',
      'Победа мафии — когда их количество ≥ мирным',
    ],
  },
  bunker: {
    name:       'Бункер',
    emoji:      '🏚️',
    color:      '#f59e0b',
    desc:       'Конец света. В бункере ограниченные места. Каждый игрок — уникальный персонаж с профессией, навыком и тайной.',
    meta:       '👥 4–16 игроков · ⏱ 20–40 мин',
    minPlayers: 4,
    maxPlayers: 16,
    defaultMax: 10,
    rules: [
      'Каждый получает карточку персонажа с профессией, здоровьем, навыком и тайной',
      'Игроки по очереди раскрывают характеристики и убеждают остальных',
      'Голосованием исключают тех, кто не нужен в бункере',
      'Тайны раскрываются при исключении — они могут всё изменить',
      'Побеждают те, кто попал в бункер',
    ],
  },
  alias: {
    name:       'Алиас',
    emoji:      '🗣️',
    color:      '#22c55e',
    desc:       'Объясняй слова — только словами, жестами или мимикой. Команды соревнуются кто назовёт больше слов за время.',
    meta:       '👥 4–20 игроков · ⏱ 15–30 мин',
    minPlayers: 4,
    maxPlayers: 20,
    defaultMax: 8,
    rules: [
      'Игроки делятся на команды по 2+ человека',
      'Один объясняет слово — нельзя использовать однокоренные слова',
      'Команда угадывает за отведённое время (обычно 60 сек)',
      'За каждое угаданное слово — 1 очко',
      'Побеждает команда с наибольшим количеством очков',
    ],
  },
};

// ─── СОСТОЯНИЕ ───────────────────────────────────────────────────────────────

let gameType   = null;
let gameInfo   = null;
let refreshInterval = null;

// ─── ИНИЦИАЛИЗАЦИЯ ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Читаем тип игры из URL: ?g=mafia
  const params = new URLSearchParams(window.location.search);
  gameType = params.get('g') || 'mafia';

  if (!GAMES[gameType]) {
    window.location.href = 'index.html';
    return;
  }

  gameInfo = GAMES[gameType];

  // Обновляем заголовок страницы
  document.title = `${gameInfo.name} — HlorGames`;

  // Заполняем hero секцию
  document.getElementById('heroEmoji').textContent  = gameInfo.emoji;
  document.getElementById('heroTitle').textContent  = gameInfo.name;
  document.getElementById('heroDesc').textContent   = gameInfo.desc;
  document.getElementById('heroMeta').textContent   = gameInfo.meta;

  // Цветовой акцент для этой игры
  document.documentElement.style.setProperty('--game-color', gameInfo.color);

  // Правила
  const rulesList = document.getElementById('gameRules');
  rulesList.innerHTML = gameInfo.rules.map(r => `<li class="g-rule">${r}</li>`).join('');

  // Navbar
  initNavbar();
  bindAuthButtons();

  // Ждём Supabase и грузим данные
  setTimeout(() => {
    setupCreateForm();
    loadLobbies();
    // Автообновление каждые 30 секунд
    refreshInterval = setInterval(loadLobbies, 30000);
  }, 500);
});

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

function initNavbar() {
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const navbar = document.getElementById('navbar');
    navbar.classList.toggle('navbar--scrolled', y > 20);
    if (y > lastY && y > 80) {
      navbar.classList.add('navbar--hidden');
    } else {
      navbar.classList.remove('navbar--hidden');
    }
    lastY = y;
  });

  document.getElementById('burgerBtn').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
    document.getElementById('navAuth').classList.toggle('open');
  });
}

function bindAuthButtons() {
  document.getElementById('btnLogin')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btnRegister')?.addEventListener('click', () => openAuthModal('register'));
  document.getElementById('modalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });
  setTimeout(restoreSession, 600);
}

// showToast для этой страницы
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── ФОРМА СОЗДАНИЯ ЛОББИ ────────────────────────────────────────────────────

function setupCreateForm() {
  // Заполняем select с количеством игроков
  const sel = document.getElementById('lobbyMaxPlayers');
  sel.innerHTML = '';
  for (let i = gameInfo.minPlayers; i <= gameInfo.maxPlayers; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${i} игроков`;
    if (i === gameInfo.defaultMax) opt.selected = true;
    sel.appendChild(opt);
  }

  updateCreateFormVisibility();
}

function updateCreateFormVisibility() {
  const notice = document.getElementById('createLoginNotice');
  const form   = document.getElementById('createForm');
  if (currentUser) {
    notice.classList.add('hidden');
    form.classList.remove('hidden');
  } else {
    notice.classList.remove('hidden');
    form.classList.add('hidden');
  }
}

// ─── СОЗДАНИЕ ЛОББИ ──────────────────────────────────────────────────────────

async function handleCreateLobby(e) {
  e.preventDefault();
  const errEl = document.getElementById('createError');
  errEl.textContent = '';

  if (!currentUser) {
    openAuthModal('login');
    return;
  }

  const name       = document.getElementById('lobbyName').value.trim() || `Лобби ${generateCode()}`;
  const maxPlayers = parseInt(document.getElementById('lobbyMaxPlayers').value);
  const password   = document.getElementById('lobbyPassword').value.trim();
  const code       = generateCode();

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Создаём...';

  if (!supabaseClient) {
    showToast(`Комната создана! Код: ${code}`, 'success');
    btn.disabled = false;
    btn.textContent = 'Создать комнату';
    return;
  }

  try {
    const { error } = await supabaseClient.from('lobbies').insert({
      code,
      name,
      game:        gameType,
      host_id:     currentUser.id,
      host_name:   currentUser.nickname,
      status:      'waiting',
      max_players: maxPlayers,
      password:    password || null,
      players:     [{ id: currentUser.id, nickname: currentUser.nickname }],
    });

    if (error) throw error;

    showToast(`Комната «${name}» создана! Код: ${code}`, 'success');
    document.getElementById('lobbyName').value = '';
    document.getElementById('lobbyPassword').value = '';
    loadLobbies();
  } catch (err) {
    console.error('[Game] Ошибка создания лобби:', err);
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать комнату';
  }
}

// ─── ЗАГРУЗКА ЛОББИ ──────────────────────────────────────────────────────────

async function loadLobbies() {
  if (!supabaseClient) {
    document.getElementById('activeLobbies').innerHTML = '<p class="g-empty">Подключись к Supabase для просмотра лобби</p>';
    document.getElementById('pastLobbies').innerHTML   = '<p class="g-empty">—</p>';
    return;
  }

  try {
    const { data: active, error: e1 } = await supabaseClient
      .from('lobbies')
      .select('*')
      .eq('game', gameType)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: past, error: e2 } = await supabaseClient
      .from('lobbies')
      .select('*')
      .eq('game', gameType)
      .in('status', ['ended', 'active'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (e1) throw e1;

    renderActiveLobbies(active || []);
    renderPastLobbies(past || []);
  } catch (err) {
    console.error('[Game] Ошибка загрузки лобби:', err);
    document.getElementById('activeLobbies').innerHTML = `<p class="g-empty g-error">Ошибка: ${err.message}</p>`;
  }
}

function renderActiveLobbies(lobbies) {
  const wrap = document.getElementById('activeLobbies');
  if (!lobbies.length) {
    wrap.innerHTML = `
      <div class="g-empty-state">
        <div class="g-empty-icon">${gameInfo.emoji}</div>
        <p>Нет активных лобби</p>
        <span>Создай первую комнату!</span>
      </div>
    `;
    return;
  }

  wrap.innerHTML = lobbies.map(l => {
    const players    = Array.isArray(l.players) ? l.players.length : 0;
    const maxP       = l.max_players || gameInfo.maxPlayers;
    const pct        = Math.round((players / maxP) * 100);
    const hasPass    = !!l.password;
    const name       = l.name || `Лобби ${l.code}`;
    const hostName   = l.host_name || 'Игрок';
    const timeAgo    = getTimeAgo(l.created_at);
    const isFull     = players >= maxP;

    return `
      <div class="g-lobby-card ${isFull ? 'g-lobby-card--full' : ''}">
        <div class="g-lobby-card__top">
          <div class="g-lobby-name">${esc(name)}</div>
          <div class="g-lobby-code">${esc(l.code)}</div>
        </div>
        <div class="g-lobby-host">👤 ${esc(hostName)}</div>
        <div class="g-lobby-fill">
          <div class="g-fill-bar">
            <div class="g-fill-bar__inner" style="width:${pct}%"></div>
          </div>
          <span class="g-fill-text">${players}/${maxP}</span>
        </div>
        <div class="g-lobby-footer">
          <span class="g-lobby-time">${timeAgo}</span>
          ${hasPass ? '<span class="g-locked">🔒</span>' : ''}
          <button class="btn btn--primary g-join-btn ${isFull ? 'disabled' : ''}"
            onclick="joinLobby('${esc(l.code)}', ${hasPass})"
            ${isFull ? 'disabled' : ''}>
            ${isFull ? 'Полная' : 'Войти'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderPastLobbies(lobbies) {
  const wrap = document.getElementById('pastLobbies');
  if (!lobbies.length) {
    wrap.innerHTML = '<p class="g-empty">Нет завершённых игр</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="g-past-table">
      <thead>
        <tr><th>Название</th><th>Хост</th><th>Игроков</th><th>Статус</th><th>Дата</th></tr>
      </thead>
      <tbody>
        ${lobbies.map(l => `
          <tr>
            <td>${esc(l.name || l.code)}</td>
            <td>${esc(l.host_name || '—')}</td>
            <td>${Array.isArray(l.players) ? l.players.length : 0}</td>
            <td>${statusLabel(l.status)}</td>
            <td>${fmtDate(l.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ─── ВХОД В ЛОББИ ────────────────────────────────────────────────────────────

async function joinLobby(code, hasPassword) {
  if (!currentUser) {
    openAuthModal('login');
    showToast('Войди чтобы присоединиться', 'error');
    return;
  }

  if (hasPassword) {
    const pass = prompt('Введи пароль комнаты:');
    if (pass === null) return;
    // Здесь можно добавить проверку пароля
  }

  if (!supabaseClient) {
    showToast(`Вход в комнату ${code}`, 'success');
    return;
  }

  try {
    const { data: lobby, error } = await supabaseClient
      .from('lobbies')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !lobby) {
      showToast('Комната не найдена', 'error');
      return;
    }
    if (lobby.status !== 'waiting') {
      showToast('Игра уже началась или завершена', 'error');
      return;
    }

    const players   = Array.isArray(lobby.players) ? lobby.players : [];
    const maxP      = lobby.max_players || gameInfo.maxPlayers;
    const alreadyIn = players.some(p => p.id === currentUser.id);

    if (!alreadyIn) {
      if (players.length >= maxP) {
        showToast('Комната заполнена', 'error');
        return;
      }
      players.push({ id: currentUser.id, nickname: currentUser.nickname });
      await supabaseClient.from('lobbies').update({ players }).eq('code', code);
    }

    showToast(`Вошёл в комнату ${code}!`, 'success');
    loadLobbies();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

async function handleJoinByCode() {
  const code  = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  const errEl = document.getElementById('joinError');
  errEl.textContent = '';

  if (!code || code.length < 4) {
    errEl.textContent = 'Введи код комнаты';
    return;
  }

  await joinLobby(code, false);
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

function generateCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function getTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusLabel(status) {
  const map = {
    waiting: '<span style="color:#22c55e">Ожидание</span>',
    active:  '<span style="color:#60a5fa">Идёт игра</span>',
    ended:   '<span style="color:#888">Завершена</span>',
  };
  return map[status] || status;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Обновляем форму создания при изменении авторизации
const _origOnSignedIn  = typeof onUserSignedIn  !== 'undefined' ? onUserSignedIn  : () => {};
const _origOnSignedOut = typeof onUserSignedOut !== 'undefined' ? onUserSignedOut : () => {};

// Переопределяем чтобы также обновить форму
window._gameOnSignedIn = function(user) {
  _origOnSignedIn(user);
  updateCreateFormVisibility();
};
window._gameOnSignedOut = function() {
  _origOnSignedOut();
  updateCreateFormVisibility();
};
