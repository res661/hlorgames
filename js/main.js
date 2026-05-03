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
    const seed       = [];
    const ctxRow     = {
      host_id: currentUser.id,
      syncMafiaGrid: selectedGame === 'mafia',
    };
    const players    = window.LobbySeatUtils
      ? window.LobbySeatUtils.normalizeLobbySlotsForSave(seed, seatT, ctxRow)
      : [];

    const { error } = await supabaseClient.from('lobbies').insert({
      code,
      game:        selectedGame,
      host_id:     currentUser.id,
      host_name:   currentUser.nickname,
      status:      'waiting',
      max_players: maxPlayers,
      host_plays:  false,
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
  const codeWant = document.getElementById('joinCode').value.trim().toUpperCase();
  const errEl = document.getElementById('joinError');
  errEl.textContent = '';

  if (!codeWant || codeWant.length < 4) {
    errEl.textContent = 'Введи код комнаты';
    return;
  }

  if (!currentUser) {
    openAuthModal('login');
    showToast('Сначала войди — тогда добавим тебя в состав комнаты', 'error');
    return;
  }

  const active = typeof getActiveLobby === 'function' ? getActiveLobby() : null;
  if (active && String(active.code || '').toUpperCase() !== codeWant) {
    errEl.textContent = 'Ты уже в другой комнате. Сначала выйди: плашка справа внизу.';
    return;
  }

  if (!supabaseClient) {
    errEl.textContent = 'Нет связи с сервером';
    return;
  }

  try {
    const { data: lobby, error } = await (typeof window.hlorFetchLobbyByCode === 'function'
      ? window.hlorFetchLobbyByCode(codeWant)
      : supabaseClient.from('lobbies').select('*').eq('code', codeWant).maybeSingle());

    if (error && !lobby) {
      console.warn('[main joinLobby]', error);
      errEl.textContent = 'Не удалось загрузить комнату';
      return;
    }
    if (!lobby) {
      errEl.textContent = 'Комната не найдена';
      return;
    }
    if (lobby.status !== 'waiting') {
      errEl.textContent = 'Игра уже началась или комната закрыта';
      return;
    }

    let players = Array.isArray(lobby.players) ? [...lobby.players] : [];
    const maxP = lobby.max_players || 16;
    const seatCtx = {
      host_id: lobby.host_id,
      syncMafiaGrid: lobby.game === 'mafia',
    };
    const alreadyIn = players.some((p) => String(p.id) === String(currentUser.id));
    const joiningAsHost = String(lobby.host_id) === String(currentUser.id);

    if (!alreadyIn && !joiningAsHost) {
      let n = 0;
      const seen = new Set();
      for (const p of players) {
        if (p && p.id != null && !seen.has(String(p.id))) {
          seen.add(String(p.id));
          n++;
        }
      }
      if (n >= maxP) {
        errEl.textContent = 'Комната заполнена';
        return;
      }
      players.push({
        id: currentUser.id,
        nickname: currentUser.nickname,
        ready: false,
        joined_at: Date.now(),
      });
    }

    if (window.LobbySeatUtils && lobby.status === 'waiting') {
      const normalized = window.LobbySeatUtils.normalizeLobbySlotsForSave(players, maxP, seatCtx);
      const { error: upErr } = await supabaseClient
        .from('lobbies')
        .update({ players: normalized })
        .eq('code', lobby.code);
      if (upErr) throw upErr;
      if (lobby.game === 'mafia' && typeof window.hlorBroadcastMafiaRoomPayload === 'function') {
        window.hlorBroadcastMafiaRoomPayload(lobby.code);
      }
    }

    const gameKey = lobby.game || 'mafia';
    const isHostJoin = String(lobby.host_id) === String(currentUser.id);

    if (typeof setActiveLobby === 'function') {
      setActiveLobby(String(lobby.code).toUpperCase(), gameKey, lobby.name || lobby.code, {
        roomStatus: lobby.status === 'active' ? 'active' : 'waiting',
        viewOrigin: gameKey === 'mafia' ? 'game' : 'lobby',
        isHost: isHostJoin,
      });
    }

    closeLobbyModal();
    showToast(`Вхожу в комнату ${lobby.code}!`, 'success');

    const bust = Date.now();
    setTimeout(() => {
      if (gameKey === 'mafia') {
        window.location.href = `mafia-play.html?code=${encodeURIComponent(lobby.code)}&role=${
          isHostJoin ? 'host' : 'player'
        }&t=${bust}`;
      } else {
        window.location.href = `lobby.html?code=${encodeURIComponent(lobby.code)}&t=${bust}`;
      }
    }, 250);
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

// ─── АДМИН-ПАНЕЛЬ ─────────────────────────────────────────────────────────────
// Кнопка «Админ-панель» только у role = superadmin (см. shared.js + admin.js).

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
