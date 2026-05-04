/**
 * Локальная геймификация (localStorage): заход в комнаты мафии / «Кто я?», время за столами, закрытые лобби, достижения.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hlor_player_stats_v1';

  function defaults() {
    return {
      version: 3,
      mafiaTableOpens: 0,
      whoamiTableOpens: 0,
      sessionsCompleted: 0,
      playTimeSeconds: 0,
    };
  }

  function migrate(raw) {
    var o = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 3,
      mafiaTableOpens: Number(o.mafiaTableOpens) || 0,
      whoamiTableOpens: Number(o.whoamiTableOpens) || 0,
      sessionsCompleted: Number(o.sessionsCompleted) || 0,
      playTimeSeconds: Number(o.playTimeSeconds) || 0,
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var o = JSON.parse(raw);
      return migrate(o);
    } catch (_) {
      return defaults();
    }
  }

  function save(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (_) {}
    if (typeof window.hlorPushStatsToProfile === 'function') {
      window.hlorPushStatsToProfile();
    }
  }

  /**
   * @param {string} lobbyCode — код комнаты
   * @param {string} [gameSlug] — «mafia» (по умолчанию) или «whoami»
   */
  function recordTableOpen(lobbyCode, gameSlug) {
    var code = String(lobbyCode || '').trim().toUpperCase();
    if (!code) return;
    var g = gameSlug === 'whoami' ? 'whoami' : 'mafia';
    var sk = 'hlor_stats_open_' + code + '_' + g;
    if (sessionStorage.getItem(sk)) return;
    sessionStorage.setItem(sk, '1');
    var stats = load();
    if (g === 'whoami') stats.whoamiTableOpens = (Number(stats.whoamiTableOpens) || 0) + 1;
    else stats.mafiaTableOpens = (Number(stats.mafiaTableOpens) || 0) + 1;
    save(stats);
  }

  function recordLobbyEnd(payload) {
    var code = String((payload && payload.lobbyCode) || '').trim().toUpperCase();
    if (!code) return;
    var sk = 'hlor_stats_ended_' + code;
    if (sessionStorage.getItem(sk)) return;
    sessionStorage.setItem(sk, '1');

    var stats = load();
    stats.sessionsCompleted += 1;
    save(stats);
  }

  function addPlayTime(seconds) {
    if (seconds <= 0) return;
    var stats = load();
    stats.playTimeSeconds += seconds;
    save(stats);
  }

  var timerId = null;
  function tickSec() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    addPlayTime(10);
  }
  function startPlayTimer() {
    if (timerId) return;
    timerId = setInterval(tickSec, 10000);
  }
  function stopPlayTimer() {
    if (!timerId) return;
    clearInterval(timerId);
    timerId = null;
  }

  function formatDuration(seconds) {
    var s = Math.max(0, Math.floor(seconds || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ' ч ' + m + ' мин';
    if (m > 0) return m + ' мин ' + sec + ' с';
    return sec + ' с';
  }

  function clampPct(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  /**
   * @typedef {{ id: string, tier: 'common'|'uncommon'|'rare'|'epic'|'legendary', icon: string, title: string, desc: string, ok: boolean, progress: number }} AchievementDef
   * @param {object} stats
   * @returns {AchievementDef[]}
   */
  function achievementDefs(stats) {
    var s = Object.assign({}, defaults(), stats || {});
    var sc = s.sessionsCompleted || 0;
    var mafia = s.mafiaTableOpens || 0;
    var whoami = s.whoamiTableOpens || 0;
    var anyTable = mafia + whoami;
    var pt = s.playTimeSeconds || 0;

    /** @type {AchievementDef[]} */
    var list = [
      {
        id: 'first_visit',
        tier: 'common',
        icon: '🎲',
        title: 'За столом',
        desc: 'Зайди в комнату по коду — мафия или «Кто я?» (счётчик в этом браузере)',
        ok: anyTable >= 1,
        progress: clampPct((anyTable / 1) * 100),
      },
      {
        id: 'finisher',
        tier: 'common',
        icon: '🏁',
        title: 'До финиша',
        desc: 'Останься в игре, когда хост закрыл лобби (хотя бы раз)',
        ok: sc >= 1,
        progress: clampPct((sc / 1) * 100),
      },
      {
        id: 'table_regular',
        tier: 'common',
        icon: '🚪',
        title: 'Знакомый вход',
        desc: '10+ заходов за стол (мафия и «Кто я?» в сумме)',
        ok: anyTable >= 10,
        progress: clampPct((anyTable / 10) * 100),
      },
      {
        id: 'mafia_fan',
        tier: 'uncommon',
        icon: '🎭',
        title: 'Мафия не отпускает',
        desc: '5+ раз заходил в комнату мафии',
        ok: mafia >= 5,
        progress: clampPct((mafia / 5) * 100),
      },
      {
        id: 'whoami_fan',
        tier: 'uncommon',
        icon: '❓',
        title: 'Кто я? — свой человек',
        desc: '5+ раз заходил в комнату «Кто я?»',
        ok: whoami >= 5,
        progress: clampPct((whoami / 5) * 100),
      },
      {
        id: 'both_games',
        tier: 'rare',
        icon: '⚡',
        title: 'Две игры — один игрок',
        desc: 'Попробуй и мафию, и «Кто я?» хотя бы по разу',
        ok: mafia >= 1 && whoami >= 1,
        progress: clampPct(Math.min((mafia / 1) * 50, 50) + Math.min((whoami / 1) * 50, 50)),
      },
      {
        id: 'committed',
        tier: 'uncommon',
        icon: '🎯',
        title: 'В деле',
        desc: '5 партий закончены вместе с лобби',
        ok: sc >= 5,
        progress: clampPct((sc / 5) * 100),
      },
      {
        id: 'soldier',
        tier: 'uncommon',
        icon: '🃏',
        title: 'Ветеран стола',
        desc: '10 завершённых лобби, пока ты был в комнате',
        ok: sc >= 10,
        progress: clampPct((sc / 10) * 100),
      },
      {
        id: 'veteran',
        tier: 'rare',
        icon: '🛡️',
        title: 'Боевой склад',
        desc: '25+ партий до конца лобби',
        ok: sc >= 25,
        progress: clampPct((sc / 25) * 100),
      },
      {
        id: 'champion',
        tier: 'epic',
        icon: '👑',
        title: 'Чемпион вечера',
        desc: '50+ завершённых лобби',
        ok: sc >= 50,
        progress: clampPct((sc / 50) * 100),
      },
      {
        id: 'legend_sessions',
        tier: 'legendary',
        icon: '🏆',
        title: 'Легенда HLOR',
        desc: '100+ завершённых лобби',
        ok: sc >= 100,
        progress: clampPct((sc / 100) * 100),
      },
      {
        id: 'time_30',
        tier: 'common',
        icon: '☕',
        title: 'Перерыв на партию',
        desc: '30+ минут с активной вкладкой за столом',
        ok: pt >= 1800,
        progress: clampPct((pt / 1800) * 100),
      },
      {
        id: 'time_sink',
        tier: 'uncommon',
        icon: '⏱️',
        title: 'Долго в игре',
        desc: '60+ минут суммарно за столами (вкладка активна)',
        ok: pt >= 3600,
        progress: clampPct((pt / 3600) * 100),
      },
      {
        id: 'night_shift',
        tier: 'rare',
        icon: '🌙',
        title: 'Ночная смена',
        desc: '5+ часов за столами',
        ok: pt >= 5 * 3600,
        progress: clampPct((pt / (5 * 3600)) * 100),
      },
      {
        id: 'marathon',
        tier: 'epic',
        icon: '🔥',
        title: 'Марафон',
        desc: '10+ часов суммарно за столами',
        ok: pt >= 10 * 3600,
        progress: clampPct((pt / (10 * 3600)) * 100),
      },
      {
        id: 'warmup_quarter',
        tier: 'common',
        icon: '🫖',
        title: 'Согрев',
        desc: '15+ минут за активной вкладкой за столом',
        ok: pt >= 900,
        progress: clampPct((pt / 900) * 100),
      },
      {
        id: 'table_25',
        tier: 'uncommon',
        icon: '🔑',
        title: 'Свои двери',
        desc: '25+ заходов за стол (мафия + «Кто я?»)',
        ok: anyTable >= 25,
        progress: clampPct((anyTable / 25) * 100),
      },
      {
        id: 'table_50',
        tier: 'rare',
        icon: '🗝️',
        title: 'Постоянный гость',
        desc: '50+ заходов за стол всего',
        ok: anyTable >= 50,
        progress: clampPct((anyTable / 50) * 100),
      },
      {
        id: 'table_100',
        tier: 'epic',
        icon: '💎',
        title: 'Зал без билета',
        desc: '100+ заходов за стол всего',
        ok: anyTable >= 100,
        progress: clampPct((anyTable / 100) * 100),
      },
      {
        id: 'mafia_double',
        tier: 'rare',
        icon: '🎬',
        title: 'На сцене',
        desc: '10+ заходов в комнату мафии',
        ok: mafia >= 10,
        progress: clampPct((mafia / 10) * 100),
      },
      {
        id: 'mafia_triple',
        tier: 'epic',
        icon: '🗡️',
        title: 'Король ночи',
        desc: '20+ заходов в мафию',
        ok: mafia >= 20,
        progress: clampPct((mafia / 20) * 100),
      },
      {
        id: 'whoami_double',
        tier: 'rare',
        icon: '🧠',
        title: 'На подсказках',
        desc: '10+ заходов в «Кто я?»',
        ok: whoami >= 10,
        progress: clampPct((whoami / 10) * 100),
      },
      {
        id: 'whoami_triple',
        tier: 'epic',
        icon: '✨',
        title: 'Мастер вопросов',
        desc: '20+ заходов в «Кто я?»',
        ok: whoami >= 20,
        progress: clampPct((whoami / 20) * 100),
      },
      {
        id: 'both_packed',
        tier: 'epic',
        icon: '🎪',
        title: 'Столы не сидят без тебя',
        desc: 'И в мафии, и в «Кто я?» минимум по 5 заходов',
        ok: mafia >= 5 && whoami >= 5,
        progress: clampPct(
          Math.min((mafia / 5) * 50, 50) + Math.min((whoami / 5) * 50, 50),
        ),
      },
      {
        id: 'sessions_mid',
        tier: 'common',
        icon: '🧩',
        title: 'Середина пути',
        desc: '15 завершённых лобби',
        ok: sc >= 15,
        progress: clampPct((sc / 15) * 100),
      },
      {
        id: 'sessions_strong',
        tier: 'rare',
        icon: '⚔️',
        title: 'В бою',
        desc: '40 завершённых лобби',
        ok: sc >= 40,
        progress: clampPct((sc / 40) * 100),
      },
      {
        id: 'sessions_elite',
        tier: 'epic',
        icon: '🌟',
        title: 'Элита стола',
        desc: '75 завершённых лобби',
        ok: sc >= 75,
        progress: clampPct((sc / 75) * 100),
      },
      {
        id: 'sessions_titan',
        tier: 'legendary',
        icon: '💫',
        title: 'Титан',
        desc: '150 завершённых лобби',
        ok: sc >= 150,
        progress: clampPct((sc / 150) * 100),
      },
      {
        id: 'sessions_immortal',
        tier: 'legendary',
        icon: '♾️',
        title: 'Бессмертный игрок',
        desc: '200 завершённых лобби',
        ok: sc >= 200,
        progress: clampPct((sc / 200) * 100),
      },
      {
        id: 'time_two_h',
        tier: 'uncommon',
        icon: '📻',
        title: 'Два часа в эфире',
        desc: '2+ часа за столами (вкладка активна)',
        ok: pt >= 2 * 3600,
        progress: clampPct((pt / (2 * 3600)) * 100),
      },
      {
        id: 'time_three_h',
        tier: 'rare',
        icon: '🎧',
        title: 'Три часа подряд и не только',
        desc: '3+ часа суммарно за столами',
        ok: pt >= 3 * 3600,
        progress: clampPct((pt / (3 * 3600)) * 100),
      },
      {
        id: 'time_ultra',
        tier: 'legendary',
        icon: '🌋',
        title: 'Ультра-марафон',
        desc: '25+ часов за столами',
        ok: pt >= 25 * 3600,
        progress: clampPct((pt / (25 * 3600)) * 100),
      },
      {
        id: 'closer_habit',
        tier: 'uncommon',
        icon: '✅',
        title: 'Довожу до конца',
        desc: '8+ закрытых лобби и не меньше 15 заходов за стол',
        ok: sc >= 8 && anyTable >= 15,
        progress: clampPct(
          Math.min((sc / 8) * 50, 50) + Math.min((anyTable / 15) * 50, 50),
        ),
      },
      {
        id: 'time_and_games',
        tier: 'rare',
        icon: '⏳',
        title: 'Время и партии',
        desc: '3+ часа за столом и 5+ завершённых лобби',
        ok: pt >= 3 * 3600 && sc >= 5,
        progress: clampPct(
          Math.min((pt / (3 * 3600)) * 50, 50) + Math.min((sc / 5) * 50, 50),
        ),
      },
    ];

    return list;
  }

  /** Среднее время на одну закрытую комнату (грубо, по суммарному времени за столами) */
  function avgSecondsPerEndedSession(stats) {
    var s = Object.assign({}, defaults(), stats || {});
    var sc = s.sessionsCompleted || 0;
    if (!sc) return null;
    return Math.round((s.playTimeSeconds || 0) / sc);
  }

  window.hlorStats = {
    load: load,
    save: save,
    recordTableOpen: recordTableOpen,
    recordLobbyEnd: recordLobbyEnd,
    startPlayTimer: startPlayTimer,
    stopPlayTimer: stopPlayTimer,
    formatDuration: formatDuration,
    achievementDefs: achievementDefs,
    avgSecondsPerEndedSession: avgSecondsPerEndedSession,
  };
})();
