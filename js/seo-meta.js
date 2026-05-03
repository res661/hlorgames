/**
 * Open Graph / Twitter Card + canonical (статический сайт).
 * Вызывается синхронно в <head> после site-config.js.
 */
(function () {
  'use strict';

  function publicOrigin() {
    var cfg = typeof window !== 'undefined' ? window.HLOR_PUBLIC_ORIGIN : '';
    cfg = String(cfg || '').replace(/\/$/, '').trim();
    if (cfg) return cfg;
    if (typeof location !== 'undefined' && location.origin) return location.origin.replace(/\/$/, '');
    return '';
  }

  function abs(path) {
    var o = publicOrigin();
    if (!path) return o || '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.charAt(0) !== '/') path = '/' + path;
    return o ? o + path : path;
  }

  function ensureMeta(getter, setter) {
    var el = getter();
    if (!el) {
      el = document.createElement('meta');
      setter(el);
      document.head.appendChild(el);
    }
    return el;
  }

  function setMetaName(name, content) {
    if (content == null || content === '') return;
    var el = ensureMeta(
      function () {
        return document.querySelector('meta[name="' + name + '"]');
      },
      function (e) {
        e.setAttribute('name', name);
      },
    );
    el.setAttribute('content', content);
  }

  function setMetaProp(prop, content) {
    if (content == null || content === '') return;
    var el = ensureMeta(
      function () {
        return document.querySelector('meta[property="' + prop + '"]');
      },
      function (e) {
        e.setAttribute('property', prop);
      },
    );
    el.setAttribute('content', content);
  }

  function setCanonical(href) {
    if (!href) return;
    var el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
  }

  var G = {
    mafia: {
      title: 'Мафия онлайн — HLOR GAMES',
      desc: 'Классическая мафия в браузере: роли, ночь, голосование. Создай лобби и зови друзей.',
    },
    bunker: {
      title: 'Бункер онлайн — HLOR GAMES',
      desc: 'Конец света — не все попадут в бункер. Раскрой характеры, голосование, секретные тайны.',
    },
    alias: {
      title: 'Алиас онлайн — HLOR GAMES',
      desc: 'Объясняй слова без созвучных подсказок. Команды, таймер, очки.',
    },
  };

  var root = typeof document !== 'undefined' ? document.documentElement : null;
  var pageKind = root && root.getAttribute('data-hlor-page');
  pageKind = pageKind ? pageKind.trim() : '';

  var slug =
    (root && root.getAttribute('data-hlor-game-slug') && root.getAttribute('data-hlor-game-slug').trim()) ||
    (typeof window !== 'undefined' && window.__HLOR_GAME_QUERY__ ? String(window.__HLOR_GAME_QUERY__).trim() : '') ||
    '';
  slug = slug.toLowerCase();

  var path = '';
  try {
    path = typeof location !== 'undefined' ? location.pathname || '' : '';
  } catch (e) {}

  var search = '';
  try {
    search = typeof location !== 'undefined' && location.search ? location.search : '';
  } catch (e2) {}

  var bundle = {};
  var defaultImg = '/img/logo.png';

  function canonGameHtml(slugStr) {
    if (!slugStr) return '/game.html';
    var query = '?g=' + encodeURIComponent(slugStr);
    if (!path) return '/game.html' + query;
    var i = path.lastIndexOf('/');
    var dir = i >= 0 ? path.slice(0, i + 1) : '/';
    return dir + 'game.html' + query;
  }

  var shareSlug = '';
  if (/play-mafia\.html$/i.test(path)) shareSlug = 'mafia';
  else if (/play-bunker\.html$/i.test(path)) shareSlug = 'bunker';
  else if (/play-alias\.html$/i.test(path)) shareSlug = 'alias';

  if (pageKind === 'profile') {
    bundle = {
      title: 'Профиль — HLOR GAMES',
      desc: 'Ник, аватар, статистика и достижения в HLOR GAMES.',
    };
    bundle.canonicalPath = path ? path + search : '/profile.html';
  } else if (pageKind === 'game' && slug && G[slug]) {
    bundle = {
      title: G[slug].title,
      desc: G[slug].desc,
    };
    if (/\/game\.html$/i.test(path))
      bundle.canonicalPath =
        path + (/[?&]g=/.test(search) ? search : (search ? search + '&' : '?') + 'g=' + encodeURIComponent(slug));
    else bundle.canonicalPath = canonGameHtml(slug);
  } else if (shareSlug && G[shareSlug]) {
    bundle = {
      title: G[shareSlug].title,
      desc: G[shareSlug].desc,
    };
    bundle.canonicalPath = canonGameHtml(shareSlug);
    bundle.ogUrlPath = path + search || path;
  } else if (pageKind === 'game') {
    bundle = {
      title: 'Игры онлайн — HLOR GAMES',
      desc: 'Мафия, бункер и алиас: создай комнату или присоединись по коду.',
    };
    bundle.canonicalPath = path ? path + search : '/game.html';
  } else if (pageKind === 'lobby') {
    bundle = {
      title: 'Лобби — HLOR GAMES',
      desc: 'Комната ожидания: готовность, чат, код для друзей.',
    };
    bundle.canonicalPath = path ? path + search : '/lobby.html';
  } else if (pageKind === 'mafia-play') {
    bundle = {
      title: 'Стол мафии — HLOR GAMES',
      desc: 'Игровой стол: фазы, голосование, чат ведущего.',
    };
    bundle.canonicalPath = path ? path + search : '/mafia-play.html';
  } else if (pageKind === 'top') {
    bundle = {
      title: 'Топ игроков — HLOR GAMES',
      desc: 'Рейтинг по комнатам: хосты, участники, создание комнат.',
    };
    bundle.canonicalPath = path ? path + search : '/top.html';
  } else if (pageKind === 'admin') {
    bundle = {
      title: 'Админ — HLOR GAMES',
      desc: 'Панель администратора HLOR GAMES.',
    };
    bundle.canonicalPath = path ? path + search : '/admin.html';
  } else {
    bundle = {
      title: 'HLOR GAMES — играй с друзьями онлайн',
      desc: 'Мафия, бункер и алиас в браузере. Лобби, код комнаты, без установки.',
    };
    bundle.canonicalPath = path + search || '/';
  }

  var pageUrl = bundle.ogUrlPath ? abs(bundle.ogUrlPath) : abs(bundle.canonicalPath || path + search || '/');
  var imageUrl = abs(defaultImg);

  if (bundle.title) document.title = bundle.title;

  setMetaName('description', bundle.desc);
  setMetaProp('og:type', 'website');
  setMetaProp('og:site_name', 'HLOR GAMES');
  setMetaProp('og:locale', 'ru_RU');
  setMetaProp('og:title', bundle.title);
  setMetaProp('og:description', bundle.desc);
  setMetaProp('og:url', pageUrl);
  setMetaProp('og:image', imageUrl);
  setMetaProp('og:image:alt', 'HLOR GAMES');

  setMetaName('twitter:card', 'summary_large_image');
  setMetaName('twitter:title', bundle.title);
  setMetaName('twitter:description', bundle.desc);
  setMetaName('twitter:image', imageUrl);

  setCanonical(abs(bundle.canonicalPath));
})();
