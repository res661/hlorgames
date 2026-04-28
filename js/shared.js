/**
 * SHARED.JS — работает на всех страницах сайта
 * - Секретный toggle "admin" на клавиатуре
 * - Базовые утилиты
 */

(function () {
  'use strict';

  let _buf       = '';
  let _unlocked  = false;

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      _buf = '';
      return;
    }

    _buf += e.key.toLowerCase();
    if (_buf.length > 5) _buf = _buf.slice(-5);

    if (_buf === 'admin') {
      _buf = '';
      _handleAdminToggle();
    }
  });

  function _handleAdminToggle() {
    // Проверяем авторизацию
    const user = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!user) {
      _toast('Сначала войди в аккаунт', 'error');
      return;
    }

    _unlocked = !_unlocked;

    const dropdown = document.getElementById('userDropdown');

    if (_unlocked) {
      // Добавляем кнопку если её ещё нет
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

      // Визуальная подсказка на аватарке
      const avatar = document.getElementById('navAvatar');
      if (avatar) avatar.style.borderColor = 'rgba(200,255,78,0.6)';

      _toast('🔑 Режим администратора включён', 'success');
    } else {
      // Убираем кнопку
      document.getElementById('secretAdminBtn')?.remove();
      document.getElementById('secretAdminDivider')?.remove();

      const avatar = document.getElementById('navAvatar');
      if (avatar) avatar.style.borderColor = '';

      _toast('Режим администратора выключен');
    }
  }

  function _toast(msg, type = '') {
    // Используем глобальный showToast если есть, иначе свой
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

})();
