/**
 * LOBBY-INDICATOR.JS
 * Плавающий виджет внизу справа, пока пользователь «в комнате».
 *
 * Логика:
 * · «Назад» / лого с lobby.html или mafia-play.html — НЕ покидает комнату, индикатор остаётся.
 * · «Выйти / Закрыть комнату» в лобби или «Выйти» в виджете — выход для игрока ИЛИ закрытие для всех (хост).
 * · Если последнее обновление было со страницы игры и игра активна — отдельный текст («покинул экран игры»).
 */

const LOBBY_KEY = 'hlor_active_lobby';
const SESSION_DISMISS_KEY = 'hlor_lobby_indicator_dismiss';

const GAME_EMOJIS = { mafia: '🕵️', bunker: '🏚️', alias: '🗣️' };

function mergeLobbyPayload(code, game, name, extras) {
  const c = String(code || '').toUpperCase();
  const ex = extras || {};
  return {
    code: c,
    game: game || 'mafia',
    name: String(name || c || '').trim() || c,
    ts: Date.now(),
    roomStatus: ex.roomStatus === 'active' ? 'active' : 'waiting',
    viewOrigin: ex.viewOrigin === 'game' ? 'game' : 'lobby',
    isHost: !!ex.isHost,
  };
}

/**
 * extras: { roomStatus: 'waiting'|'active', viewOrigin: 'lobby'|'game', isHost?: boolean }
 */
function setActiveLobby(code, game, name, extras) {
  try {
    sessionStorage.removeItem(SESSION_DISMISS_KEY);
  } catch (_) {}
  const payload = mergeLobbyPayload(code, game, name, extras);
  localStorage.setItem(LOBBY_KEY, JSON.stringify(payload));
  renderLobbyIndicator();
}

function clearActiveLobby() {
  localStorage.removeItem(LOBBY_KEY);
  try {
    sessionStorage.removeItem(SESSION_DISMISS_KEY);
  } catch (_) {}
  document.getElementById('lobbyIndicator')?.remove();
}

function getActiveLobby() {
  try {
    const raw = localStorage.getItem(LOBBY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(LOBBY_KEY);
      return null;
    }
    return {
      roomStatus: 'waiting',
      viewOrigin: 'lobby',
      isHost: false,
      ...data,
    };
  } catch {
    return null;
  }
}

/** Тексты: различаем «просто свернул сайт со страницы лобби» и «ушёл со страницы активной игры». */
function buildIndicatorTexts(lobby) {
  const nm = lobby.name || lobby.code || '';
  const safeNm = escHtml(nm);
  const st = lobby.roomStatus || 'waiting';
  const origin = lobby.viewOrigin || 'lobby';

  let label = 'Ты в комнате';
  let sub =
    `Комната «${safeNm}». Обновление не снимает тебя с места — «Назад» и лого комнату не закрывают.`;

  if (st === 'active' && origin === 'game') {
    label = 'Экран игры закрыт';
    sub =
      `«${safeNm}»: стол может быть открыт. Нажми «Вернуться» ниже или заверши участие — ведущий закрывает стол для всех, игрок только выходит сам.`;
  } else if (st === 'active') {
    label = lobby.isHost ? 'Ведущий: стол активен' : 'Стол активен';
    sub =
      `«${safeNm}». Вернись к игре или заверши свой участие; ведущий может закрыть всем ниже или в лобби.`;
  } else if (st === 'waiting') {
    label = 'Комната ждёт';
    sub = `«${safeNm}» · Ты свернул лобби, но остаёшься в составе до выхода.`;
  }

  return { label, safeNm, sub };
}

function pathnameHas(file) {
  return (window.location.pathname || '').toLowerCase().includes(file.toLowerCase());
}

function currentUrlCodeUpper() {
  const q = new URLSearchParams(window.location.search).get('code');
  return q ? String(q).toUpperCase() : '';
}

// ─── Рендер ──────────────────────────────────────────────────────────────────

function renderLobbyIndicator() {
  const lobby = getActiveLobby();
  document.getElementById('lobbyIndicator')?.remove();

  if (!lobby) return;

  try {
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === lobby.code) return;
  } catch (_) {}

  const mine = String(lobby.code || '').toUpperCase();
  const urlC = currentUrlCodeUpper();

  // Не дублируем на том же коде уже в интерфейсе лобби / мафии
  if ((pathnameHas('lobby.html') || pathnameHas('/lobby')) && urlC === mine) return;
  if ((pathnameHas('mafia-play.html') || pathnameHas('/mafia-play')) && urlC === mine) return;

  const emoji = GAME_EMOJIS[lobby.game] || '🎮';
  const { label, safeNm, sub } = buildIndicatorTexts(lobby);
  const leaveLabel = lobby.isHost ? 'Закрыть комнату' : 'Выйти из комнаты';

  const el = document.createElement('div');
  el.id = 'lobbyIndicator';
  el.className = 'lobby-indicator';
  el.innerHTML = `
    <div class="lobby-indicator__bar"></div>
    <div class="lobby-indicator__pulse"></div>
    <div class="lobby-indicator__body">
      <div class="lobby-indicator__content">
        <span class="lobby-indicator__icon">${emoji}</span>
        <div class="lobby-indicator__text">
          <span class="lobby-indicator__label">${label}</span>
          <span class="lobby-indicator__name">${safeNm}</span>
          <p class="lobby-indicator__sub">${sub}</p>
        </div>
      </div>
      <button type="button" class="lobby-indicator__close" title="Свернуть напоминание" aria-label="Свернуть">✕</button>
    </div>
    <div class="lobby-indicator__foot">«Назад» и переход по сайту не закрывает комнату.</div>
    <div class="lobby-indicator__btns">
      <button type="button" class="lobby-indicator__goto">↩ Вернуться</button>
      <button type="button" class="lobby-indicator__leave">${escHtml(leaveLabel)}</button>
    </div>
  `;

  document.body.appendChild(el);

  el.querySelector('.lobby-indicator__goto')?.addEventListener('click', () => goToActiveLobby());
  el.querySelector('.lobby-indicator__leave')?.addEventListener('click', leaveFromIndicator);
  el.querySelector('.lobby-indicator__close')?.addEventListener('click', closeLobbyIndicator);

  requestAnimationFrame(() => el.classList.add('lobby-indicator--visible'));
}

async function goToActiveLobby() {
  const lobby = getActiveLobby();
  if (!lobby) return;
  const code = String(lobby.code || '').toUpperCase();
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data } = await supabaseClient.from('lobbies').select('status,game').eq('code', code).maybeSingle();
      if (data && data.game === 'mafia' && data.status === 'active') {
        window.location.href = `mafia-play.html?code=${encodeURIComponent(code)}`;
        return;
      }
    } catch (_) {}
  }
  window.location.href = `lobby.html?code=${encodeURIComponent(code)}`;
}

function closeLobbyIndicator() {
  const lobby = getActiveLobby();
  if (lobby) {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, lobby.code);
    } catch (_) {}
  }
  const el = document.getElementById('lobbyIndicator');
  if (el) {
    el.classList.remove('lobby-indicator--visible');
    setTimeout(() => el.remove(), 300);
  }
}

function openLobbyLeaveConfirm(opts) {
  const { title, text, okText, danger, onConfirm } = opts;
  const overlay = document.createElement('div');
  overlay.className = 'lobby-confirm-overlay';
  overlay.id = 'lobbyConfirmOverlay';
  overlay.innerHTML = `
    <div class="lobby-confirm-box">
      <div class="lobby-confirm-icon">${danger ? '🚪' : '👋'}</div>
      <div class="lobby-confirm-title">${escHtml(title)}</div>
      <div class="lobby-confirm-text">${text}</div>
      <div class="lobby-confirm-actions">
        <button type="button" class="lobby-confirm-cancel">Остаться</button>
        <button type="button" class="lobby-confirm-ok">${escHtml(okText || 'Да')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.lobby-confirm-cancel').onclick = () => overlay.remove();
  overlay.querySelector('.lobby-confirm-ok').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

async function leaveFromIndicator() {
  const lobby = getActiveLobby();
  if (!lobby) return;

  let uid = typeof currentUser !== 'undefined' && currentUser?.id ? currentUser.id : null;
  if (!uid && typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      uid = data?.session?.user?.id ?? null;
    } catch (_) {}
  }

  let isHostRm = !!lobby.isHost;
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    try {
      const { data } = await supabaseClient.from('lobbies').select('host_id').eq('code', lobby.code).maybeSingle();
      if (data && uid) isHostRm = String(data.host_id) === String(uid);
    } catch (_) {}
  }

  const title = isHostRm ? 'Закрыть комнату для всех?' : 'Выйти из комнаты?';
  const text = isHostRm
    ? 'Как хост / ведущий ты завершишь лобби и игру для всех участников.'
    : 'Ты только уберёшь себя из комнаты — остальные продолжат. Вернуться можно по коду.';
  const okText = isHostRm ? 'Закрыть для всех' : 'Выйти';

  openLobbyLeaveConfirm({
    title,
    text,
    okText,
    danger: true,
    onConfirm: async () => {
      const loc = getActiveLobby();
      clearActiveLobby();
      if (typeof supabaseClient !== 'undefined' && supabaseClient && loc) {
        try {
          const code = String(loc.code || '').toUpperCase();
          const { data } = await supabaseClient.from('lobbies').select('players,host_id,status').eq('code', code).single();
          let u = uid;
          if (!u) {
            const { data: s } = await supabaseClient.auth.getSession();
            u = s?.session?.user?.id ?? null;
          }
          if (data && u) {
            if (String(data.host_id) === String(u)) {
              await supabaseClient.from('lobbies').update({ status: 'ended' }).eq('code', code);
            } else {
              const players = (data.players || []).filter((p) => String(p.id) !== String(u));
              await supabaseClient.from('lobbies').update({ players }).eq('code', code);
            }
          }
        } catch (_) {}
      }
      if (typeof showToast === 'function') showToast(isHostRm ? 'Комната закрыта' : 'Ты вышел из комнаты', 'success');
    },
  });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(renderLobbyIndicator, 800);
});

window.addEventListener('pageshow', () => {
  renderLobbyIndicator();
});
