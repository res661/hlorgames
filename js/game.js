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

  // Обновляем заголовок и навбар
  document.title = `${gameInfo.name} — HlorGames`;
  const navLink = document.getElementById('navCurrentGame');
  if (navLink) navLink.textContent = gameInfo.name;

  // Заполняем hero
  const heroEmoji = document.getElementById('heroEmoji');
  const heroTitle = document.getElementById('heroTitle');
  const heroDesc  = document.getElementById('heroDesc');
  const heroMeta  = document.getElementById('heroMeta');
  if (heroEmoji) heroEmoji.textContent = gameInfo.emoji;
  if (heroTitle) heroTitle.textContent = gameInfo.name;
  if (heroDesc)  heroDesc.textContent  = gameInfo.desc;
  if (heroMeta)  heroMeta.textContent  = gameInfo.meta;

  // Цветовой акцент для этой игры
  document.documentElement.style.setProperty('--game-color', gameInfo.color);

  // Правила + описание
  const rulesList = document.getElementById('gameRules');
  if (rulesList) rulesList.innerHTML = gameInfo.rules.map(r => `<li class="g-rule">${r}</li>`).join('');
  const aboutEl = document.getElementById('gameAbout');
  if (aboutEl) aboutEl.textContent = gameInfo.desc;

  // Navbar
  initNavbar();
  bindAuthButtons();

  // Обновляем форму при любом изменении авторизации
  window._onAuthUpdate = updateCreateFormVisibility;

  // Ждём первого определения авторизации (не угадываем таймаут)
  const initPage = () => {
    setupCreateForm();
    loadLobbies();
    refreshInterval = setInterval(loadLobbies, 30000);
  };

  // _onAuthFirstLoad сработает когда onAuthStateChange определит сессию
  window._onAuthFirstLoad = initPage;

  // Страховочный таймаут — если auth вообще не ответил за 1.5с
  setTimeout(() => {
    if (window._onAuthFirstLoad) {
      window._onAuthFirstLoad = null;
      initPage();
    }
  }, 1500);
});

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

// ─── БЫСТРЫЕ ДЕЙСТВИЯ HERO ───────────────────────────────────────────────────

function scrollAndCreate() {
  switchSideTab('create');
  scrollToSidebar();
  if (!currentUser) openAuthModal('login');
}

function scrollToSidebar() {
  document.querySelector('.game-sidebar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showJoinModal() {
  document.getElementById('joinCodeModal')?.classList.add('open');
  setTimeout(() => document.getElementById('heroCodeInput')?.focus(), 100);
}

async function handleHeroJoin() {
  const code  = document.getElementById('heroCodeInput').value.trim().toUpperCase();
  const errEl = document.getElementById('heroJoinError');
  errEl.textContent = '';
  if (!code || code.length < 4) { errEl.textContent = 'Введи код'; return; }
  document.getElementById('joinCodeModal').classList.remove('open');
  await joinLobby(code, false);
}

// ─────────────────────────────────────────────────────────────────────────────

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
  setTimeout(startAuthListener, 300);
}

// showToast для этой страницы
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── ТАБЫ САЙДБАРА ────────────────────────────────────────────────────────────

function switchSideTab(tab) {
  const tabs   = { create: 'tabCreate',   mylobbies: 'tabMyLobbies',   rules: 'tabRules'   };
  const panels = { create: 'panelCreate', mylobbies: 'panelMyLobbies', rules: 'panelRules' };
  Object.values(tabs).forEach(id   => document.getElementById(id)?.classList.remove('active'));
  Object.values(panels).forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById(tabs[tab])?.classList.add('active');
  document.getElementById(panels[tab])?.classList.remove('hidden');
  if (tab === 'mylobbies') loadMyLobbies();
}

async function loadMyLobbies() {
  const wrap = document.getElementById('myLobbiesList');
  if (!currentUser || !supabaseClient) {
    wrap.innerHTML = '<p class="g-empty">Войди чтобы видеть свои лобби</p>';
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('lobbies')
      .select('*')
      .eq('host_id', currentUser.id)
      .eq('game', gameType)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    if (!data?.length) {
      wrap.innerHTML = '<p class="g-empty">Ты ещё не создавал лобби</p>';
      return;
    }
    wrap.innerHTML = data.map(l => {
      const isWaiting = l.status === 'waiting';
      const players = Array.isArray(l.players) ? l.players.length : 0;
      return `
        <div class="g-my-lobby ${isWaiting ? 'g-my-lobby--active' : ''}">
          <div class="g-my-lobby__top">
            <span class="g-my-lobby__name">${esc(l.name || l.code)}</span>
            <code class="g-lobby-code">${esc(l.code)}</code>
          </div>
          <div class="g-my-lobby__meta">
            <span>${players} игр.</span>
            <span>${fmtTimeAgo(l.created_at)}</span>
            ${isWaiting ? '<span class="g-my-lobby__status">● Открыто</span>' : '<span style="color:var(--text-dim)">Завершено</span>'}
          </div>
          ${isWaiting ? `<a href="lobby.html?code=${l.code}" class="btn btn--primary g-join-btn" style="margin-top:.6rem;font-size:.78rem">Войти</a>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="g-empty g-error">${err.message}</p>`;
  }
}

function fmtTimeAgo(iso) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (d < 1) return 'только что';
  if (d < 60) return `${d} мин`;
  if (d < 1440) return `${Math.floor(d/60)} ч`;
  return `${Math.floor(d/1440)} дн`;
}

// ─── ФОРМА СОЗДАНИЯ ЛОББИ ────────────────────────────────────────────────────

function setupCreateForm() {
  // Кастомный select
  const dropdown = document.getElementById('lobbyMaxPlayersDropdown');
  const btn      = document.getElementById('lobbyMaxPlayersBtn');
  const label    = document.getElementById('lobbyMaxPlayersLabel');
  const hidden   = document.getElementById('lobbyMaxPlayers');
  const wrap     = document.getElementById('lobbyMaxPlayersWrap');

  if (dropdown && btn) {
    dropdown.innerHTML = '';
    for (let i = gameInfo.minPlayers; i <= gameInfo.maxPlayers; i++) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'custom-select__item' + (i === gameInfo.defaultMax ? ' active' : '');
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
    hidden.value = gameInfo.defaultMax;

    btn.onclick = (e) => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    };
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) wrap.classList.remove('open');
    });
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
    setTimeout(() => window.location.href = `lobby.html?code=${code}`, 500);
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

    showToast(`Комната «${name}» создана!`, 'success');
    // Мафия → сразу на игровую страницу как хост
    setTimeout(() => {
      if (gameType === 'mafia') {
        window.location.href = `mafia-play.html?code=${code}&role=host`;
      } else {
        window.location.href = `lobby.html?code=${code}`;
      }
    }, 500);
  } catch (err) {
    console.error('[Game] Ошибка создания лобби:', err);
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать комнату';
  }
}

let cachedActiveLobbies = [];

function filterLobbies() {
  const q = (document.getElementById('lobbySearch')?.value || '').toLowerCase();
  const filtered = cachedActiveLobbies.filter(l =>
    !q || (l.name || l.code).toLowerCase().includes(q) || l.code.toLowerCase().includes(q)
  );
  renderActiveLobbies(filtered);
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

    cachedActiveLobbies = active || [];
    filterLobbies(); // применяем текущий поиск
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

  wrap.innerHTML = `
    <table class="g-lobby-table">
      <thead>
        <tr>
          <th>Название</th>
          <th>Хост</th>
          <th>Игроки</th>
          <th>Код</th>
          <th>Создано</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${lobbies.map(l => {
          const players  = Array.isArray(l.players) ? l.players.length : 0;
          const maxP     = l.max_players || gameInfo.maxPlayers;
          const pct      = Math.round((players / maxP) * 100);
          const hasPass  = !!l.password;
          const name     = l.name || `Лобби ${l.code}`;
          const hostName = l.host_name || 'Игрок';
          const timeAgo  = getTimeAgo(l.created_at);
          const isFull   = players >= maxP;
          return `
            <tr class="g-lobby-row ${isFull ? 'g-lobby-row--full' : ''}">
              <td class="g-lobby-row__name">
                ${hasPass ? '<svg class="g-locked-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : ''}
                ${esc(name)}
              </td>
              <td>${esc(hostName)}</td>
              <td>
                <div class="g-fill-inline">
                  <div class="g-fill-bar">
                    <div class="g-fill-bar__inner" style="width:${pct}%"></div>
                  </div>
                  <span class="g-fill-text">${players}/${maxP}</span>
                </div>
              </td>
              <td><span class="g-lobby-code">${esc(l.code)}</span></td>
              <td class="g-lobby-row__time">${timeAgo}</td>
              <td>
                <button class="btn btn--primary g-join-btn ${isFull ? 'disabled' : ''}"
                  onclick="joinLobby('${esc(l.code)}', ${hasPass})"
                  ${isFull ? 'disabled' : ''}>
                  ${isFull ? 'Полная' : 'Войти'}
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
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

    showToast(`Вхожу в комнату ${code}!`, 'success');
    // Для Мафии — определяем номер слота (позиция в списке) и идём на игровую страницу
    const mySlotIdx = players.findIndex(p => p.id === currentUser.id);
    setTimeout(() => {
      if (gameType === 'mafia') {
        window.location.href = `mafia-play.html?code=${code}&role=player&slot=${mySlotIdx}`;
        return;
      }
      window.location.href = `lobby.html?code=${code}`;
    }, 400);
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

