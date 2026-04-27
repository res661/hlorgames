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
  // Тень при скролле
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('navbar--scrolled', scrollY > 20);
  });

  // Бургер (мобильное меню)
  document.getElementById('burgerBtn').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
    document.getElementById('navAuth').classList.toggle('open');
  });

  // Закрыть мобильное меню при клике на ссылку
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
  const modal        = document.getElementById('lobbyModal');
  const createView   = document.getElementById('lobbyCreateView');
  const joinView     = document.getElementById('lobbyJoinView');
  const title        = document.getElementById('lobbyModalTitle');

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
  // Синхронизируем выбор в модальном окне
  document.querySelectorAll('.game-select__item').forEach(b => {
    b.classList.toggle('active', b.dataset.val === game);
  });
}

// Генерация короткого кода комнаты
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

  if (isDemoMode || !supabase) {
    // Demo-режим: просто показываем код
    closeLobbyModal();
    showToast(`Комната создана! Код: ${code}`, 'success');
    setTimeout(() => {
      alert(`Твой код комнаты: ${code}\n\nПоделись им с друзьями!\n\n(В demo-режиме — настрой Supabase для полноценной работы)`);
    }, 500);
    return;
  }

  try {
    const { data, error } = await supabase.from('lobbies').insert({
      code,
      game:       selectedGame,
      host_id:    currentUser.id,
      status:     'waiting',
      players:    [{ id: currentUser.id, nickname: currentUser.nickname }],
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;

    closeLobbyModal();
    showToast(`Комната создана! Код: ${code}`, 'success');
    // Можно добавить редирект на страницу лобби:
    // window.location.href = `lobby.html?code=${code}`;
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

  if (isDemoMode || !supabase) {
    closeLobbyModal();
    showToast(`Подключаюсь к комнате ${code}... (demo-режим)`, 'success');
    return;
  }

  try {
    const { data, error } = await supabase.from('lobbies').select('*').eq('code', code).single();
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
    // window.location.href = `lobby.html?code=${code}`;
  } catch (err) {
    errEl.textContent = 'Ошибка: ' + err.message;
  }
}

// ─── СТАТИСТИКА (онлайн игроков и сессий) ────────────────────────────────────

async function loadStats() {
  if (isDemoMode || !supabase) {
    document.getElementById('statPlayers').textContent  = '—';
    document.getElementById('statSessions').textContent = '—';
    return;
  }

  try {
    const [{ count: players }, { count: sessions }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('lobbies').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ]);
    document.getElementById('statPlayers').textContent  = players  ?? 0;
    document.getElementById('statSessions').textContent = sessions ?? 0;
  } catch {}
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initHeroButtons();
  loadStats();

  // Закрытие лобби-модала
  document.getElementById('lobbyModalClose').addEventListener('click', closeLobbyModal);
  document.getElementById('lobbyModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLobbyModal();
  });
});
