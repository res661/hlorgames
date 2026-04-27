/**
 * LOBBY-INDICATOR.JS
 * Показывает плавающий виджет когда пользователь находится в активном лобби.
 * Работает на всех страницах. Данные хранятся в localStorage.
 */

const LOBBY_KEY = 'hlor_active_lobby';

const GAME_EMOJIS = { mafia: '🕵️', bunker: '🏚️', alias: '🗣️' };

// ─── Сохранить / удалить лобби ───────────────────────────────────────────────

function setActiveLobby(code, game, name) {
  localStorage.setItem(LOBBY_KEY, JSON.stringify({ code, game, name, ts: Date.now() }));
  renderLobbyIndicator();
}

function clearActiveLobby() {
  localStorage.removeItem(LOBBY_KEY);
  const el = document.getElementById('lobbyIndicator');
  if (el) el.remove();
}

function getActiveLobby() {
  try {
    const raw = localStorage.getItem(LOBBY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Убираем через 4 часа
    if (Date.now() - data.ts > 4 * 60 * 60 * 1000) {
      localStorage.removeItem(LOBBY_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

// ─── Рендер виджета ──────────────────────────────────────────────────────────

function renderLobbyIndicator() {
  const lobby = getActiveLobby();

  // Удаляем старый виджет если есть
  document.getElementById('lobbyIndicator')?.remove();

  if (!lobby) return;

  // Не показываем на самой странице лобби
  if (window.location.pathname.includes('lobby.html') &&
      new URLSearchParams(window.location.search).get('code') === lobby.code) {
    return;
  }

  const emoji = GAME_EMOJIS[lobby.game] || '🎮';
  const name  = lobby.name || lobby.code;

  const el = document.createElement('div');
  el.id = 'lobbyIndicator';
  el.className = 'lobby-indicator';
  el.innerHTML = `
    <div class="lobby-indicator__pulse"></div>
    <div class="lobby-indicator__content">
      <span class="lobby-indicator__icon">${emoji}</span>
      <div class="lobby-indicator__text">
        <span class="lobby-indicator__label">Ты в лобби</span>
        <span class="lobby-indicator__name">${escHtml(name)}</span>
      </div>
    </div>
    <button class="lobby-indicator__goto" onclick="goToActiveLobby()">Вернуться →</button>
    <button class="lobby-indicator__close" onclick="closeLobbyIndicator()" title="Закрыть">✕</button>
  `;
  document.body.appendChild(el);

  // Анимация появления
  requestAnimationFrame(() => el.classList.add('lobby-indicator--visible'));
}

function goToActiveLobby() {
  const lobby = getActiveLobby();
  if (lobby) window.location.href = `lobby.html?code=${lobby.code}`;
}

function closeLobbyIndicator() {
  const el = document.getElementById('lobbyIndicator');
  if (el) {
    el.classList.remove('lobby-indicator--visible');
    setTimeout(() => el.remove(), 300);
  }
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(renderLobbyIndicator, 800);
});
