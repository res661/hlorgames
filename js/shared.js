/**
 * SHARED.JS — утилиты на всех страницах
 * «Админ-панель» только у superadmin в БД.
 * Суперадмин может скрыть/показать ярлык: набрать admin (латиницей, не в поле ввода).
 */

(function () {
  'use strict';

  const LS_ADMIN_LEGACY = 'hlor_secret_admin_ui';
  /** '1' или отсутствует — показывать кнопку; '0' — скрыть (только UI, роль в БД не меняется). */
  const LS_SUPERADMIN_PANEL = 'hlor_superadmin_panel_visible';

  function superadminPanelVisiblePref() {
    try {
      return localStorage.getItem(LS_SUPERADMIN_PANEL) !== '0';
    } catch {
      return true;
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
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function _resolveProfileRole() {
    if (typeof currentUser !== 'undefined' && currentUser?.id && currentUser.role) {
      return currentUser.role;
    }
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) return null;
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        return profile?.role || 'user';
      } catch {
        return null;
      }
    }
    return null;
  }

  async function _handleSuperadminAdminKeyboardToggle() {
    const role = await _resolveProfileRole();
    if (role !== 'superadmin') return;

    let justHidden = true;
    try {
      const cur = localStorage.getItem(LS_SUPERADMIN_PANEL);
      if (cur === '0') {
        localStorage.setItem(LS_SUPERADMIN_PANEL, '1');
        justHidden = false;
      } else {
        localStorage.setItem(LS_SUPERADMIN_PANEL, '0');
        justHidden = true;
      }
    } catch (_) {}

    await hlorSyncSuperadminAdminUi();

    if (justHidden) {
      _toast('Панель скрыта. Набери снова admin — вернуть кнопку «Админ-панель».', '');
    } else {
      _toast('Кнопка «Админ-панель» снова показана.', 'success');
    }
  }

  let _adminBuf = '';
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) {
      _adminBuf = '';
      return;
    }

    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;

    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      _adminBuf += e.key.toLowerCase();
      if (_adminBuf.length > 5) _adminBuf = _adminBuf.slice(-5);
      if (_adminBuf === 'admin') {
        _adminBuf = '';
        void _handleSuperadminAdminKeyboardToggle();
      }
      return;
    }

    _adminBuf = '';
  });

  function removeSuperadminAdminLinks() {
    document.getElementById('superadminAdminBtn')?.remove();
    document.getElementById('superadminAdminDivider')?.remove();
    document.getElementById('hlorSuperadminAdminFab')?.remove();
    document.getElementById('secretAdminBtn')?.remove();
    document.getElementById('secretAdminDivider')?.remove();
    document.getElementById('hlorSecretAdminFab')?.remove();
  }

  function injectSuperadminDropdownButton() {
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown || document.getElementById('superadminAdminBtn')) return;

    const div = document.createElement('div');
    div.className = 'user-dropdown__divider';
    div.id = 'superadminAdminDivider';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'superadminAdminBtn';
    btn.className = 'user-dropdown__item';
    btn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Админ-панель
        `;
    btn.onclick = () => {
      window.location.href = 'admin.html';
    };

    const logoutBtn = dropdown.querySelector('.user-dropdown__item--danger');
    if (logoutBtn) {
      dropdown.insertBefore(div, logoutBtn);
      dropdown.insertBefore(btn, logoutBtn);
    } else {
      dropdown.appendChild(div);
      dropdown.appendChild(btn);
    }
  }

  function ensureSuperadminFab() {
    if (document.getElementById('hlorSuperadminAdminFab')) return;
    const fab = document.createElement('a');
    fab.id = 'hlorSuperadminAdminFab';
    fab.href = 'admin.html';
    fab.className = 'hlor-secret-admin-fab';
    fab.textContent = 'Админ-панель';
    fab.title = 'Панель суперадмина (набери admin — скрыть кнопку)';
    document.body.appendChild(fab);
  }

  async function hlorSyncSuperadminAdminUi() {
    removeSuperadminAdminLinks();

    let role = null;
    if (typeof currentUser !== 'undefined' && currentUser?.id && currentUser.role) {
      role = currentUser.role;
    } else if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.user) return;
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        role = profile?.role || 'user';
      } catch {
        return;
      }
    } else {
      return;
    }

    if (role !== 'superadmin') return;
    if (!superadminPanelVisiblePref()) return;

    if (document.getElementById('userDropdown')) {
      injectSuperadminDropdownButton();
    } else {
      ensureSuperadminFab();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      localStorage.removeItem(LS_ADMIN_LEGACY);
    } catch (_) {}
    setTimeout(() => {
      void hlorSyncSuperadminAdminUi();
    }, 450);
  });

  window.hlorSyncSuperadminAdminUi = hlorSyncSuperadminAdminUi;

  /** SELECT lobbies по коду из URL/поля и из таблицы (регистр может отличаться). */
  window.hlorFetchLobbyByCode = async function (codeWant) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      return { data: null, error: { message: 'Supabase недоступен' } };
    }
    const raw = String(codeWant || '').trim();
    if (!raw) return { data: null, error: null };
    const cand = [...new Set([raw, raw.toUpperCase(), raw.toLowerCase()])];
    let lastErr = null;
    for (const c of cand) {
      const { data, error } = await supabaseClient.from('lobbies').select('*').eq('code', c).maybeSingle();
      if (error) lastErr = error;
      else if (data) return { data, error: null };
    }
    return { data: null, error: lastErr };
  };

  /** Уведомить все открытые mafia-play этой комнаты перечитать lobbies (состав слотов). */
  window.hlorBroadcastMafiaRoomPayload = function (roomCode, payload) {
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !roomCode) return;
    const code = String(roomCode).trim().toUpperCase();
    const CHANNEL = `mafia:${code}`;
    const body = payload || { type: 'lobby_players_ping', ts: Date.now() };
    const ch = supabaseClient.channel(CHANNEL);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'game', payload: body });
        setTimeout(() => {
          try {
            supabaseClient.removeChannel(ch);
          } catch (_) {}
        }, 450);
      }
    });
  };
})();
