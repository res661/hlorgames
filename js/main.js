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

  if (typeof getActiveLobby === 'function' && getActiveLobby()) {
    showToast('Ты уже в комнате. Сначала выйди через плашку справа внизу.', 'error');
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
    const maxPlayers = 8;
    const seatT      = maxPlayers;
    const seed       = [{ id: currentUser.id, nickname: currentUser.nickname, ready: false }];
    const ctxRow     = {
      host_id: currentUser.id,
      host_plays: false,
      syncMafiaGrid: selectedGame === 'mafia',
    };
    const players    = window.LobbySeatUtils
      ? window.LobbySeatUtils.normalizeLobbySlotsForSave(seed, seatT, ctxRow)
      : [{ ...seed[0], slot: 0 }];

    const { error } = await supabaseClient.from('lobbies').insert({
      code,
      game:        selectedGame,
      host_id:     currentUser.id,
      host_name:   currentUser.nickname,
      status:      'waiting',
      max_players: maxPlayers,
      players,
    });

    if (error) throw error;

    if (typeof setActiveLobby === 'function') {
      setActiveLobby(String(code).toUpperCase(), selectedGame, code, {
        roomStatus: 'waiting',
        viewOrigin: selectedGame === 'mafia' ? 'game' : 'lobby',
        isHost: true,
      });
    }

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

  const want = String(code || '').trim().toUpperCase();
  const active = typeof getActiveLobby === 'function' ? getActiveLobby() : null;
  if (active && String(active.code || '').toUpperCase() !== want) {
    errEl.textContent = 'Ты уже в другой комнате. Сначала выйди: плашка справа внизу.';
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

// Секретный toggle "admin" теперь в shared.js (работает на всех страницах)

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
