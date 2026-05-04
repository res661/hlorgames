/**
 * Темы оформления: Lime (по умолчанию) и Minimal «Aurora» (холодный минимализм).
 * Сохранение в localStorage, без FOUC — скрипт подключать в <head> сразу после seo-meta.js.
 */
(function () {
  'use strict';

  var LS = 'hlor_theme';

  function stored() {
    try {
      return localStorage.getItem(LS);
    } catch (e) {
      return null;
    }
  }

  function apply(name) {
    var t = name === 'minimal' ? 'minimal' : 'lime';
    try {
      localStorage.setItem(LS, t);
    } catch (e) {}

    if (t === 'minimal') {
      document.documentElement.setAttribute('data-theme', 'minimal');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    try {
      document.documentElement.style.colorScheme = 'dark';
    } catch (e) {}

    syncToggleUi();
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'minimal' ? 'minimal' : 'lime';
  }

  function cycle() {
    apply(current() === 'lime' ? 'minimal' : 'lime');
  }

  function toggleHint() {
    return current() === 'minimal'
      ? 'Тема: Aurora (минимализм). Нажми — вернуть лайм.'
      : 'Тема: Lime. Нажми — минимализм Aurora.';
  }

  function syncToggleUi() {
    var hint = toggleHint();
    document.querySelectorAll('.theme-toggle').forEach(function (el) {
      el.title = hint;
      el.setAttribute('aria-label', hint);
      el.setAttribute('aria-pressed', current() === 'minimal' ? 'true' : 'false');
    });
  }

  window.hlorTheme = {
    apply: apply,
    cycle: cycle,
    current: current,
    syncToggleUi: syncToggleUi,
  };

  apply(stored() || 'lime');

  var ICON_SVG =
    '<svg class="theme-toggle__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' +
    '</svg>';

  function appendToggle(host, before) {
    if (!host || host.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.innerHTML = ICON_SVG;
    btn.addEventListener('click', function () {
      cycle();
    });

    var ref = null;
    if (typeof before === 'string') {
      ref = host.querySelector(before);
    } else if (before && before.nodeType === 1) {
      ref = before;
    }

    if (ref && host.contains(ref)) {
      host.insertBefore(btn, ref);
    } else {
      host.insertBefore(btn, host.firstChild);
    }
  }

  function mountToggles() {
    appendToggle(document.querySelector('.navbar__container'), '#navAuth');
    var mfRight = document.querySelector('.mafia-topbar__right');
    if (mfRight) appendToggle(mfRight, mfRight.firstElementChild);
    var adm = document.querySelector('.a-topbar-right');
    if (adm) appendToggle(adm, adm.firstElementChild);
    var lbRight = document.querySelector('.lobby-topbar__right');
    if (lbRight) appendToggle(lbRight, lbRight.firstElementChild);
    syncToggleUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggles);
  } else {
    mountToggles();
  }
})();
