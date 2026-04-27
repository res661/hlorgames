/**
 * AUTH.JS — Регистрация (ник + email + пароль), вход (email + пароль)
 */

let currentUser = null;

// ─── Открытие/закрытие ───────────────────────────────────────────────────────

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

// ─── ВХОД ────────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');

  errEl.textContent = '';

  // Demo режим
  if (isDemoMode) {
    currentUser = { id: 'demo', email, nickname: email.split('@')[0], role: 'user' };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast('Вошёл в demo-режиме', 'success');
    return;
  }

  // Supabase не готов
  if (!supabase) {
    errEl.textContent = 'Ошибка подключения к базе данных. Открой F12 → Console для деталей.';
    console.error('[Auth] supabase = null при попытке входа');
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Входим...';

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await fetchProfile(data.user.id);
    currentUser = {
      ...data.user,
      nickname: profile?.nickname || email.split('@')[0],
      role:     profile?.role     || 'user',
    };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Добро пожаловать, ${currentUser.nickname}!`, 'success');
  } catch (err) {
    console.error('[Auth] Ошибка входа:', err);
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

  errEl.textContent = '';
  console.log('[Auth] Попытка регистрации:', { nickname, email });

  // Demo режим
  if (isDemoMode) {
    currentUser = { id: 'demo', email, nickname, role: 'user' };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Привет, ${nickname}! (demo)`, 'success');
    return;
  }

  // Supabase не готов
  if (!supabase) {
    errEl.textContent = 'Ошибка подключения к базе данных. Открой F12 → Console для деталей.';
    console.error('[Auth] supabase = null при попытке регистрации');
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Создаём аккаунт...';

  try {
    // Проверяем уникальность ника
    console.log('[Auth] Проверяем уникальность ника...');
    const { data: existing, error: checkErr } = await supabase
      .from('profiles')
      .select('id')
      .ilike('nickname', nickname)
      .maybeSingle();

    if (checkErr) {
      // Если таблица не существует — даём понятную ошибку
      console.error('[Auth] Ошибка проверки ника:', checkErr);
      if (checkErr.message.includes('does not exist') || checkErr.code === '42P01') {
        throw new Error('Таблица profiles не найдена. Запусти SQL из инструкции в Supabase → SQL Editor.');
      }
      throw checkErr;
    }

    if (existing) {
      throw new Error('Этот ник уже занят — придумай другой');
    }

    // Регистрация в Supabase Auth
    console.log('[Auth] Создаём аккаунт в Auth...');
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) throw signUpError;

    console.log('[Auth] Аккаунт создан, user id:', data.user?.id);

    // Создаём профиль
    const { error: profileError } = await supabase.from('profiles').insert({
      id:       data.user.id,
      nickname,
      email,
    });
    if (profileError) {
      console.error('[Auth] Ошибка создания профиля:', profileError);
      throw profileError;
    }

    currentUser = { ...data.user, nickname, role: 'user' };
    onUserSignedIn(currentUser);
    closeAuthModal();
    showToast(`Аккаунт создан! Добро пожаловать, ${nickname}!`, 'success');
    console.log('[Auth] ✅ Регистрация успешна');

  } catch (err) {
    console.error('[Auth] Ошибка регистрации:', err);
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
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    return data;
  } catch {
    return null;
  }
}

function translateAuthError(msg) {
  if (!msg) return 'Неизвестная ошибка';
  const map = {
    'Invalid login credentials':               'Неверный email или пароль',
    'User already registered':                 'Этот email уже зарегистрирован',
    'Password should be at least 6':           'Пароль минимум 6 символов',
    'Unable to validate email':                'Некорректный email',
    'Email not confirmed':                     'Подтверди email — проверь почту',
    'Этот ник уже занят':                      'Этот ник уже занят — придумай другой',
    'Таблица profiles не найдена':             'Таблица profiles не найдена. Запусти SQL в Supabase.',
  };
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return msg;
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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const profile = await fetchProfile(session.user.id);
      currentUser = {
        ...session.user,
        nickname: profile?.nickname || session.user.email.split('@')[0],
        role:     profile?.role     || 'user',
      };
      onUserSignedIn(currentUser);
    }
  } catch (err) {
    console.error('[Auth] restoreSession error:', err);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalClose').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });
  bindAuthButtons();

  // Небольшая задержка чтобы supabase-client успел инициализироваться
  setTimeout(restoreSession, 600);
});
