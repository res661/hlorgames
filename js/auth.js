/**
 * AUTH.JS — Регистрация (ник + email + пароль), вход (email + пароль)
 */

let currentUser = null;

/** HTML внутри .user-avatar (эмодзи, фото или буква с цветом) — задаётся в profile.js */
function hlorBuildAvatarInnerFallback(user) {
  const nick = (user?.nickname || '?')[0]?.toUpperCase() || '?';
  return `<span class="user-avatar__letter user-avatar__letter--plain">${nick}</span>`;
}

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

  if (!requireSupabase(errEl)) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Входим...';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await fetchProfile(data.user.id);
    await hlorAfterProfileLoaded(profile);
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

  if (!requireSupabase(errEl)) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Создаём аккаунт...';

  try {
    // Проверяем уникальность ника
    const { data: existing, error: checkErr } = await supabaseClient
      .from('profiles')
      .select('id')
      .ilike('nickname', nickname)
      .maybeSingle();

    if (checkErr && checkErr.code !== 'PGRST116') {
      console.error('[Auth] Ошибка проверки ника:', checkErr);
      if (checkErr.message.includes('does not exist') || checkErr.code === '42P01') {
        throw new Error('Таблица не найдена. Запусти SQL в Supabase → SQL Editor.');
      }
      throw checkErr;
    }

    if (existing) throw new Error('Этот ник уже занят — придумай другой');

    // Регистрация — передаём ник в метаданных (триггер создаст профиль автоматически)
    const { data, error: signUpError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { nickname } },
    });
    if (signUpError) throw signUpError;

    // Попытка создать профиль вручную (на случай если триггер ещё не настроен)
    // ON CONFLICT DO NOTHING — не ломается если триггер уже создал профиль
    try {
      await supabaseClient.from('profiles').insert({ id: data.user.id, nickname, email });
    } catch (_) {
      // Игнорируем — профиль уже создан триггером
    }

    const profile = await fetchProfile(data.user.id);
    await hlorAfterProfileLoaded(profile);
    currentUser = {
      ...data.user,
      nickname,
      role: profile?.role || 'user',
      show_on_leaderboard: profile?.show_on_leaderboard !== false,
    };
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
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null;
  onUserSignedOut();
  showToast('Вышел из аккаунта', 'success');
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

async function fetchProfile(userId) {
  if (!supabaseClient) return null;
  try {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    return data;
  } catch {
    return null;
  }
}

/** Слить счётчики с сервера в localStorage и отправить обратно максимум (для топа из профиля). */
async function hlorAfterProfileLoaded(profile) {
  if (typeof window.hlorMergeProfileStatsIntoLocal === 'function') {
    window.hlorMergeProfileStatsIntoLocal(profile);
  }
  if (typeof window.hlorPushStatsToProfileImmediate === 'function') {
    await window.hlorPushStatsToProfileImmediate();
  }
}

function translateAuthError(msg) {
  if (!msg) return 'Неизвестная ошибка';
  const map = {
    'Invalid login credentials':     'Неверный email или пароль',
    'User already registered':       'Этот email уже зарегистрирован',
    'Password should be at least 6': 'Пароль минимум 6 символов',
    'Email not confirmed':           'Подтверди email — проверь почту',
    'Этот ник уже занят':            'Этот ник уже занят',
    'Таблица не найдена':            'Таблица не найдена. Запусти SQL в Supabase.',
  };
  for (const [key, val] of Object.entries(map)) {
    if (msg.includes(key)) return val;
  }
  return msg;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function onUserSignedIn(user) {
  // Вызываем хук страницы если определён (используется в game.js, lobby.js)
  window._onAuthUpdate?.();
  if (typeof window.hlorSyncSuperadminAdminUi === 'function') {
    void window.hlorSyncSuperadminAdminUi();
  }
  const navAuth = document.getElementById('navAuth');
  if (!navAuth) return;
  const isAdmin = ['admin', 'superadmin'].includes(user.role);
  const avatarClass = isAdmin ? 'user-avatar user-avatar--admin' : 'user-avatar';
  const buildInner =
    typeof window.hlorBuildAvatarInnerHtml === 'function' ? window.hlorBuildAvatarInnerHtml : hlorBuildAvatarInnerFallback;
  const avatarInner = buildInner(user);

  navAuth.innerHTML = `
    <div class="navbar__auth-signed" id="navbarAuthSigned">
      <a href="profile.html" class="navbar__user navbar__user--link" onclick="document.getElementById('userDropdown')?.classList.add('hidden')">
        <div class="${avatarClass}" id="navAvatar">${avatarInner}</div>
        <span class="user-name">${user.nickname}</span>
      </a>
      <button type="button" class="navbar__user-menu-btn" id="userMenuTrigger" onclick="toggleUserMenu(); event.stopPropagation();" aria-label="Меню аккаунта" title="Выход из аккаунта">
        <span class="user-chevron">▾</span>
      </button>
      <div class="user-dropdown hidden" id="userDropdown">
        <div class="user-dropdown__header">
          <div class="${avatarClass}">${avatarInner}</div>
          <div>
            <div class="user-dropdown__name">${user.nickname}</div>
            <div class="user-dropdown__role">${isAdmin ? (user.role === 'superadmin' ? 'Суперадмин' : 'Админ') : 'Игрок'}</div>
          </div>
        </div>
        <div class="user-dropdown__divider"></div>
        <button class="user-dropdown__item user-dropdown__item--danger" onclick="handleLogout()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Выйти
        </button>
      </div>
    </div>
  `;

  // Закрыть по клику вне меню
  setTimeout(() => {
    document.addEventListener('click', closeUserMenuOutside);
  }, 10);
}

function toggleUserMenu() {
  document.getElementById('userDropdown')?.classList.toggle('hidden');
}

function closeUserMenuOutside(e) {
  const dropdown = document.getElementById('userDropdown');
  const wrap = document.getElementById('navbarAuthSigned');
  if (dropdown && wrap && !wrap.contains(e.target)) {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', closeUserMenuOutside);
  }
}

function onUserSignedOut() {
  window._onAuthUpdate?.();
  if (typeof window.hlorSyncSuperadminAdminUi === 'function') {
    void window.hlorSyncSuperadminAdminUi();
  }
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

// ─── СЛУШАТЕЛЬ СЕССИИ (работает при F5, переходах между страницами) ───────────

function startAuthListener() {
  if (!supabaseClient) return;

  // ШАГ 1: Мгновенно читаем сессию из localStorage (без сетевого запроса)
  supabaseClient.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      const profile = await fetchProfile(session.user.id);
      await hlorAfterProfileLoaded(profile);
      currentUser = {
        ...session.user,
        nickname: profile?.nickname || session.user.email.split('@')[0],
        role:     profile?.role     || 'user',
        avatar:   profile?.avatar   || null,
        show_on_leaderboard: profile?.show_on_leaderboard !== false,
      };
      onUserSignedIn(currentUser);
    }
    // Сигналим страницам — авторизация определена
    if (window._onAuthFirstLoad) {
      const cb = window._onAuthFirstLoad;
      window._onAuthFirstLoad = null;
      cb();
    }
  });

  // ШАГ 2: Слушаем последующие изменения (вход, выход, обновление токена)
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return; // уже обработано в getSession выше

    if (session?.user) {
      const profile = await fetchProfile(session.user.id);
      await hlorAfterProfileLoaded(profile);
      currentUser = {
        ...session.user,
        nickname: profile?.nickname || session.user.email.split('@')[0],
        role:     profile?.role     || 'user',
        avatar:   profile?.avatar   || null,
        show_on_leaderboard: profile?.show_on_leaderboard !== false,
      };
      onUserSignedIn(currentUser);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      if (typeof onUserSignedOut === 'function') onUserSignedOut();
    }
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });
  bindAuthButtons();

  // Запускаем слушатель после инициализации Supabase
  // onAuthStateChange сам восстановит сессию из localStorage — никаких setTimeout
  setTimeout(startAuthListener, 350);
});
