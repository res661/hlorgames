/**
 * MAIN.JS — Навигация, тосты, лобби, статистика
 */

// ─── TOAST ────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

function initNavbar() {
  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const navbar = document.getElementById('navbar');
    navbar.classList.toggle('navbar--scrolled', y > 20);
    // Скрываем при скролле вниз, показываем при скролле вверх
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

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navLinks').classList.remove('open');
      document.getElementById('navAuth').classList.remove('open');
    });
  });
}

// ─── HERO КНОПКИ ─────────────────────────────────────────────────────────────

function initHeroButtons() {
  document.getElementById('heroCreateLobby').addEventListener('click', () => {
    if (!currentUser) {
      openAuthModal('register');
      showToast('Сначала войди или зарегистрируйся', 'error');
      return;
    }
    openLobbyModal('create');
  });

  document.getElementById('heroJoinLobby').addEventListener('click', () => {
    openLobbyModal('join');
  });
}

// ─── ЛОББИ ───────────────────────────────────────────────────────────────────

let selectedGame = 'mafia';

function openLobbyModal(view = 'create') {
  const modal      = document.getElementById('lobbyModal');
  const createView = document.getElementById('lobbyCreateView');
  const joinView   = document.getElementById('lobbyJoinView');
  const title      = document.getElementById('lobbyModalTitle');

  modal.classList.add('open');

  if (view === 'create') {
    createView.classList.remove('hidden');
    joinView.classList.add('hidden');
    title.textContent = 'Создать лобби';
  } else {
    joinView.classList.remove('hidden');
    createView.classList.add('hidden');
    title.textContent = 'Войти по коду';
    document.getElementById('joinCode').value = '';
    document.getElementById('joinCode').focus();
  }
}

function closeLobbyModal() {
  document.getElementById('lobbyModal').classList.remove('open');
}

function selectGame(btn) {
  document.querySelectorAll('.game-select__item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedGame = btn.dataset.val;
}

function startGame(game) {
  if (!currentUser) {
    openAuthModal('register');
    showToast('Сначала войди или зарегистрируйся', 'error');
    return;
  }
  selectedGame = game;
  openLobbyModal('create');
  document.querySelectorAll('.game-select__item').forEach(b => {
    b.classList.toggle('active', b.dataset.val === game);
  });
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

async function createLobby() {
  if (!currentUser) {
    openAuthModal('register');
    return;
  }

  const errEl = document.getElementById('lobbyError');
  errEl.textContent = '';
  const code = generateRoomCode();

  if (!supabaseClient) {
    closeLobbyModal();
    showToast(`Комната создана! Код: ${code}`, 'success');
    return;
  }

  try {
    const { error } = await supabaseClient.from('lobbies').insert({
      code,
      game:    selectedGame,
      host_id: currentUser.id,
      status:  'waiting',
      players: [{ id: currentUser.id, nickname: currentUser.nickname }],
    });

    if (error) throw error;
    closeLobbyModal();
    showToast(`Комната создана! Код: ${code}`, 'success');
  } catch (err) {
    errEl.textContent = 'Ошибка создания комнаты: ' + err.message;
  }
}

async function joinLobby() {
  const code  = document.getElementById('joinCode').value.trim().toUpperCase();
  const errEl = document.getElementById('joinError');
  errEl.textContent = '';

  if (!code || code.length < 4) {
    errEl.textContent = 'Введи код комнаты';
    return;
  }

  if (!supabaseClient) {
    closeLobbyModal();
    showToast(`Подключаюсь к комнате ${code}...`, 'success');
    return;
  }

  try {
    const { data, error } = await supabaseClient.from('lobbies').select('*').eq('code', code).single();
    if (error || !data) {
      errEl.textContent = 'Комната не найдена';
      return;
    }
    if (data.status !== 'waiting') {
      errEl.textContent = 'Игра уже началась';
      return;
    }
    closeLobbyModal();
    showToast(`Вхожу в комнату ${code}!`, 'success');
  } catch (err) {
    errEl.textContent = 'Ошибка: ' + err.message;
  }
}

// ─── СТАТИСТИКА ───────────────────────────────────────────────────────────────

async function loadStats() {
  const playersEl  = document.getElementById('statPlayers');
  const sessionsEl = document.getElementById('statSessions');

  if (!supabaseClient) {
    if (playersEl)  playersEl.textContent  = '—';
    if (sessionsEl) sessionsEl.textContent = '—';
    return;
  }

  try {
    const [playersRes, sessionsRes] = await Promise.all([
      supabaseClient.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseClient.from('lobbies').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    ]);

    if (playersEl)  playersEl.textContent  = playersRes.count  ?? 0;
    if (sessionsEl) sessionsEl.textContent = sessionsRes.count ?? 0;
  } catch (err) {
    console.error('[Stats] Error:', err);
    if (playersEl)  playersEl.textContent  = '0';
    if (sessionsEl) sessionsEl.textContent = '0';
  }
}

// ─── СЕКРЕТНЫЙ ТРИГГЕР АДМИН-ПАНЕЛИ ──────────────────────────────────────────

// Секретный переключатель — "admin" на клавиатуре
let _adminBuf      = '';
let _adminUnlocked = false; // локальный флаг видимости кнопки

document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    _adminBuf = '';
    return;
  }
  _adminBuf += e.key.toLowerCase();
  if (_adminBuf.length > 5) _adminBuf = _adminBuf.slice(-5);

  if (_adminBuf === 'admin') {
    _adminBuf = '';
    if (!currentUser) {
      showToast('Сначала войди в аккаунт', 'error');
      return;
    }

    _adminUnlocked = !_adminUnlocked;

    if (_adminUnlocked) {
      // Добавляем кнопку "Админ панель" в дропдаун если её нет
      const dropdown = document.getElementById('userDropdown');
      if (dropdown && !dropdown.querySelector('#secretAdminBtn')) {
        const divider = document.createElement('div');
        divider.className = 'user-dropdown__divider';

        const btn = document.createElement('button');
        btn.id = 'secretAdminBtn';
        btn.className = 'user-dropdown__item';
        btn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          Админ панель
        `;
        btn.onclick = () => { window.location.href = 'admin.html'; };

        // Вставляем перед кнопкой Выйти
        const logoutBtn = dropdown.querySelector('.user-dropdown__item--danger');
        if (logoutBtn) {
          dropdown.insertBefore(divider, logoutBtn);
          dropdown.insertBefore(btn, logoutBtn);
        } else {
          dropdown.appendChild(divider);
          dropdown.appendChild(btn);
        }
      }
      showToast('🔑 Режим администратора включён', 'success');
    } else {
      // Убираем кнопку и divider
      const btn = document.getElementById('secretAdminBtn');
      if (btn) {
        btn.previousElementSibling?.remove(); // divider
        btn.remove();
      }
      showToast('Режим администратора выключен');
    }
  }
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initHeroButtons();
  // Ждём пока supabase инициализируется, затем грузим
  function tryLoadStats(attempts) {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      loadStats();
    } else if (attempts > 0) {
      setTimeout(() => tryLoadStats(attempts - 1), 500);
    }
  }
  setTimeout(() => tryLoadStats(8), 300);

  document.getElementById('lobbyModalClose').addEventListener('click', closeLobbyModal);
  document.getElementById('lobbyModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLobbyModal();
  });
});
