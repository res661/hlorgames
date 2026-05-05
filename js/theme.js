/**
 * Переключение темы «нейтральная» ↔ «лайм» (classic).
 */
(function () {
  var KEY = 'hlor-theme';

  function storedIsNeutral() {
    try {
      return localStorage.getItem(KEY) === 'neutral';
    } catch (_) {
      return true;
    }
  }

  function applyThemeFromStorage() {
    if (storedIsNeutral()) document.documentElement.setAttribute('data-theme', 'neutral');
    else document.documentElement.removeAttribute('data-theme');
  }

  function toggleTheme() {
    var next = storedIsNeutral() ? 'lime' : 'neutral';
    try {
      localStorage.setItem(KEY, next);
    } catch (_) {}
    applyThemeFromStorage();
    syncToggles();
  }

  function syncToggles() {
    var lime = !storedIsNeutral();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.title = lime ? 'Переключить на нейтральную тему' : 'Переключить на лаймовую (классическую)';
      btn.setAttribute(
        'aria-label',
        lime ? 'Тема: лаймовая. Нажми для нейтральной' : 'Тема: нейтральная. Нажми для лаймовой'
      );
    });
  }

  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || !e.storageArea) return;
    applyThemeFromStorage();
    syncToggles();
  });

  document.addEventListener('DOMContentLoaded', function () {
    applyThemeFromStorage();
    syncToggles();
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
  });
})();
