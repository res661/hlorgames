/**
 * AUTH.JS — Регистрация, вход, выход, состояние пользователя
 */

let currentUser = null;

// ─── Открытие/закрытие модального окна ───────────────────────────────────────

function openAuthModal(tab = 'login') {
  document.getElementById('authModal').classList.add('open');
  switchTab(tab);
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  clearAuthErrors();
}

function switchTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
  }
  clearAuthErrors();
}

function clearAuthErrors() {
  ['loginError','registerError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

// ─── ВХОД ────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');

  if (isDemoMode) {
    // Demo: просто устанавливаем заглушку пользователя
    currentUser = { id: 'demo', email, nickname: email.split('@')[0] };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast('Вошёл в demo-режиме', 'success');
    return;
  }

  if (!requireSupabase()) return;

  errEl.textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Входим...';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await fetchProfile(data.user.id);
    currentUser = { ...data.user, nickname: profile?.nickname || email.split('@')[0] };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Добро пожаловать, ${currentUser.nickname}!`, 'success');
  } catch (err) {
    errEl.textContent = translateAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
}

// ─── РЕГИСТРАЦИЯ ──────────────────────────────────────────────────────────────

async function handleRegister(e) {
  e.preventDefault();
  const nickname = document.getElementById('regNickname').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');

  if (isDemoMode) {
    currentUser = { id: 'demo', email, nickname };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Привет, ${nickname}! (demo-режим)`, 'success');
    return;
  }

  if (!requireSupabase()) return;

  errEl.textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Создаём аккаунт...';

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    // Создаём профиль в таблице profiles
    await supabase.from('profiles').insert({
      id:       data.user.id,
      nickname,
      email,
    });

    currentUser = { ...data.user, nickname };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Аккаунт создан! Добро пожаловать, ${nickname}!`, 'success');
  } catch (err) {
    errEl.textContent = translateAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Зарегистрироваться';
  }
}

// ─── ВЫХОД ────────────────────────────────────────────────────────────────────

async function handleLogout() {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
  onUserSignedOut();
  showToast('Вышел из аккаунта', 'success');
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

async function fetchProfile(userId) {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
  return data;
}

function translateAuthError(msg) {
  const map = {
    'Invalid login credentials':     'Неверный email или пароль',
    'User already registered':       'Этот email уже зарегистрирован',
    'Password should be at least 6': 'Пароль должен быть минимум 6 символов',
    'Unable to validate email':      'Некорректный email',
  };
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return 'Ошибка: ' + msg;
}

// ─── UI ОБНОВЛЕНИЕ ────────────────────────────────────────────────────────────

function onUserSignedIn(user) {
  const navAuth = document.getElementById('navAuth');
  navAuth.innerHTML = `
    <div class="navbar__user">
      <div class="user-avatar">${user.nickname[0].toUpperCase()}</div>
      <span class="user-name">${user.nickname}</span>
      <button class="btn btn--ghost" onclick="handleLogout()">Выйти</button>
    </div>
  `;
}

function onUserSignedOut() {
  const navAuth = document.getElementById('navAuth');
  navAuth.innerHTML = `
    <button class="btn btn--ghost" id="btnLogin">Войти</button>
    <button class="btn btn--primary" id="btnRegister">Регистрация</button>
  `;
  bindAuthButtons();
}

function bindAuthButtons() {
  document.getElementById('btnLogin')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btnRegister')?.addEventListener('click', () => openAuthModal('register'));
}

// ─── ВОССТАНОВЛЕНИЕ СЕССИИ ───────────────────────────────────────────────────

async function restoreSession() {
  if (!supabase) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const profile = await fetchProfile(session.user.id);
    currentUser = { ...session.user, nickname: profile?.nickname || session.user.email.split('@')[0] };
    onUserSignedIn(currentUser);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalClose').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });
  bindAuthButtons();
  restoreSession();
});
