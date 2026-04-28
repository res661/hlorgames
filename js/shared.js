/**
 * SHARED.JS — работает на всех страницах сайта
 * - Секретный toggle "admin" на клавиатуре (с сохранением в localStorage)
 * - Базовые утилиты
 */

(function () {
  'use strict';

  const LS_ADMIN = 'hlor_secret_admin_ui';

  let _buf      = '';
  let _unlocked = false;

  function _readUnlockFromStorage() {
    try {
      _unlocked = localStorage.getItem(LS_ADMIN) === '1';
    } catch {
      _unlocked = false;
    }
  }

  function _applySecretAdminUI(unlocked) {
    const dropdown = document.getElementById('userDropdown');

    if (unlocked) {
      if (dropdown && !document.getElementById('secretAdminBtn')) {
        const div = document.createElement('div');
        div.className = 'user-dropdown__divider';
        div.id = 'secretAdminDivider';

        const btn = document.createElement('button');
        btn.id = 'secretAdminBtn';
        btn.className = 'user-dropdown__item';
        btn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Админ панель
        `;
        btn.onclick = () => { window.location.href = 'admin.html'; };

        const logoutBtn = dropdown.querySelector('.user-dropdown__item--danger');
        if (logoutBtn) {
          dropdown.insertBefore(div, logoutBtn);
          dropdown.insertBefore(btn, logoutBtn);
        } else {
          dropdown.appendChild(div);
          dropdown.appendChild(btn);
        }
      }

      let fab = document.getElementById('hlorSecretAdminFab');
      if (!dropdown && !fab) {
        fab = document.createElement('a');
        fab.id = 'hlorSecretAdminFab';
        fab.href = 'admin.html';
        fab.className = 'hlor-secret-admin-fab';
        fab.textContent = 'Админ';
        fab.title = 'Режим администратора (секретный ввод включён)';
        document.body.appendChild(fab);
      }

      const avatar = document.getElementById('navAvatar');
      if (avatar) avatar.style.borderColor = 'rgba(200,255,78,0.6)';
    } else {
      document.getElementById('secretAdminBtn')?.remove();
      document.getElementById('secretAdminDivider')?.remove();
      document.getElementById('hlorSecretAdminFab')?.remove();

      const avatar = document.getElementById('navAvatar');
      if (avatar) avatar.style.borderColor = '';
    }
  }

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
      _buf = '';
      return;
    }

    _buf += e.key.toLowerCase();
    if (_buf.length > 5) _buf = _buf.slice(-5);

    if (_buf === 'admin') {
      _buf = '';
      void _handleAdminToggleAsync();
    }
  });

  async function _resolveUserForSecret() {
    let user = typeof currentUser !== 'undefined' ? currentUser : null;
    if (user?.id) return user;
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data } = await supabaseClient.auth.getSession();
        const u = data?.session?.user;
        if (u) return { id: u.id, email: u.email };
      } catch (_) {}
    }
    return null;
  }

  async function _handleAdminToggleAsync() {
    const user = await _resolveUserForSecret();
    if (!user) {
      _toast('Сначала войди в аккаунт', 'error');
      return;
    }

    _unlocked = !_unlocked;
    try {
      localStorage.setItem(LS_ADMIN, _unlocked ? '1' : '0');
    } catch (_) {}

    _applySecretAdminUI(_unlocked);

    if (_unlocked) {
      _toast('🔑 Режим администратора включён', 'success');
    } else {
      _toast('Режим администратора выключен');
    }
  }

  function _toast(msg, type = '') {
    if (typeof showToast === 'function') {
      showToast(msg, type);
      return;
    }
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2800);
  }

  document.addEventListener('DOMContentLoaded', () => {
    _readUnlockFromStorage();
    if (_unlocked) {
      _applySecretAdminUI(true);
    }
  });

  window.isSecretAdminUiEnabled = () => _unlocked;
})();
