/**
 * Подтягивает тему из localStorage до первой отрисовки CSS.
 * Запускать сразу после site-config.js, до link style.css.
 */
(function () {
  var KEY = 'hlor-theme';
  try {
    var v = localStorage.getItem(KEY);
    if (v === null || v === '') {
      document.documentElement.setAttribute('data-theme', 'neutral');
      localStorage.setItem(KEY, 'neutral');
      return;
    }
    if (v === 'neutral') document.documentElement.setAttribute('data-theme', 'neutral');
    else document.documentElement.removeAttribute('data-theme');
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'neutral');
  }
})();
