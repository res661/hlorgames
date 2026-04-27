/**
 * AUTH.JS — Регистрация, вход, выход через ник + пароль (без email)
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
  ['loginError', 'registerError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });
}

// Генерация скрытого внутреннего email по нику
function nicknameToEmail(nickname) {
  const safe = nickname.toLowerCase().replace(/[^a-z0-9_а-яё]/gi, '').replace(/[а-яё]/gi, 'x');
  return (safe || 'user') + '@hlorgames.local';
}

// ─── ВХОД ────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const nickname = document.getElementById('loginNickname').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');

  if (isDemoMode) {
    currentUser = { id: 'demo', nickname, role: 'user' };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Добро пожаловать, ${nickname}! (demo)`, 'success');
    return;
  }

  if (!requireSupabase()) return;

  errEl.textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Входим...';

  try {
    // Ищем email по нику (profiles доступны всем для чтения)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, nickname, role')
      .ilike('nickname', nickname)
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error('Игрок с таким ником не найден');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (error) throw error;

    currentUser = { ...data.user, nickname: profile.nickname, role: profile.role || 'user' };
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
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');

  if (isDemoMode) {
    currentUser = { id: 'demo', nickname, role: 'user' };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Привет, ${nickname}! (demo)`, 'success');
    return;
  }

  if (!requireSupabase()) return;

  if (!/^[a-zA-Zа-яёА-ЯЁ0-9_]{2,20}$/.test(nickname)) {
    errEl.textContent = 'Ник: 2–20 символов, только буквы, цифры, _';
    return;
  }

  errEl.textContent = '';
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Создаём аккаунт...';

  try {
    // Проверяем уникальность ника
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .ilike('nickname', nickname)
      .maybeSingle();

    if (existing) {
      throw new Error('Этот ник уже занят');
    }

    const email = nicknameToEmail(nickname);

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    await supabase.from('profiles').insert({
      id:       data.user.id,
      nickname,
      email,
    });

    currentUser = { ...data.user, nickname, role: 'user' };
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
    'Invalid login credentials':     'Неверный ник или пароль',
    'User already registered':       'Аккаунт уже существует',
    'Password should be at least 6': 'Пароль минимум 6 символов',
    'Unable to validate email':      'Ошибка регистрации',
    'Игрок с таким ником не найден': 'Игрок с таким ником не найден',
    'Этот ник уже занят':            'Этот ник уже занят',
  };
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return 'Ошибка: ' + msg;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function onUserSignedIn(user) {
  const navAuth = document.getElementById('navAuth');
  const isAdmin = ['admin', 'superadmin'].includes(user.role);
  navAuth.innerHTML = `
    <div class="navbar__user">
      <div class="user-avatar${isAdmin ? ' user-avatar--admin' : ''}">${user.nickname[0].toUpperCase()}</div>
      <span class="user-name">${user.nickname}${isAdmin ? ' 👑' : ''}</span>
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
    currentUser = {
      ...session.user,
      nickname: profile?.nickname || 'Игрок',
      role:     profile?.role     || 'user',
    };
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
