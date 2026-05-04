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

  /** Линейные SVG-иконки (minimal, stroke / currentColor) */
  function achIco(inner) {
    return (
      '<svg class="pf-achievement__icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      '</g></svg>'
    );
  }

  var ACH_ICONS_DEFAULT = achIco('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.4"/>');

  var ACH_ICONS = {
    first_visit: achIco(
      '<rect x="14" y="3" width="7" height="18" rx="1.5"/><path d="M3 12h8"/><polyline points="9 9 12 12 9 15"/>',
    ),
    finisher: achIco('<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12l2.5 2.5 5.3-5.3"/>'),
    table_regular: achIco('<path d="M5 8h14"/><path d="M5 12h14"/><path d="M5 16h10"/>'),
    mafia_fan: achIco(
      '<path d="M5 7c0 5.5 5 10.5 7 10.5s7-5 7-10.5H5z"/><line x1="12" y1="7" x2="12" y2="17.5"/><path d="M8.5 12h7"/>',
    ),
    whoami_fan: achIco(
      '<circle cx="12" cy="12" r="8.5"/><path d="M12 17h.01"/><path d="M9.4 9.3a3.5 3.5 0 016.1 2.4c0 2-2.8 2.8-2.8 5.3"/>',
    ),
    both_games: achIco('<rect x="4" y="5" width="9" height="9" rx="2"/><rect x="11" y="10" width="9" height="9" rx="2"/>'),
    committed: achIco(
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2"/>',
    ),
    soldier: achIco('<path d="M12 5l6 10H6z"/><path d="M12 13v8"/><path d="M8 21h8"/>'),
    veteran: achIco('<path d="M12 3.8l7 4v7c0 3.8-2.5 7.6-7 9.5-4.5-1.9-7-5.7-7-9.5V7.8l7-4z"/>'),
    champion: achIco('<path d="M5 16l2.5-8 3 4.5L12 7l3.5 5.5L19 8l3 13H6"/><path d="M5 19h14"/>'),
    legend_sessions: achIco('<path d="M9 4h6v2H9z"/><path d="M8 7h8l-.8 6.2h-6.4L8 7z"/><path d="M11 13.5V19"/><path d="M9 20h6"/>'),
    time_30: achIco('<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5l3 2"/>'),
    time_sink: achIco(
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v8l5 3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="21" y1="15" x2="19.5" y2="13.5"/>',
    ),
    night_shift: achIco('<path d="M21 13.55A9 9 0 1112.62 4.5a8 8 0 019.39 9.05z"/>'),
    marathon: achIco('<polygon points="13 3 5 14 12 14 11 21 20 11 13 11 13 3"/>'),
    warmup_quarter: achIco(
      '<path d="M8 10h10"/><path d="M9 10v10a3 3 0 003 3h2a3 3 0 003-3V10"/><path d="M18 13h2a3 3 0 010 6h-2"/>',
    ),
    table_25: achIco(
      '<circle cx="8.5" cy="17.5" r="3"/><path d="M11 15l8-9"/><path d="M17 11l4-4"/><path d="M19 15l2.5-2.5"/>',
    ),
    table_50: achIco('<path d="M7 5h13v13l-3-4-3 4V5z"/><path d="M16 21V10h7v11"/>'),
    table_100: achIco('<path d="M12 4l11 17H3l11-17z"/><line x1="12" x2="12" y1="11" y2="18"/>'),
    mafia_double: achIco(
      '<rect x="4.5" y="8" width="15" height="9" rx="1.6"/><path d="M9 13h2"/><path d="M15 13h2"/><path d="M12 12v5"/>',
    ),
    mafia_triple: achIco('<line x1="5" y1="19" x2="19" y2="5"/><circle cx="18" cy="6" r="1.75"/><path d="M8 17l4-5"/>'),
    whoami_double: achIco(
      '<path d="M12 18h0"/><path d="M10 21h4"/><path d="M12 4a6 6 0 016 6c-.45 2-2.2 3-3 6H9c-.8-3-2.55-4-3-6a6 6 0 016-6z"/>',
    ),
    whoami_triple: achIco(
      '<circle cx="12" cy="12" r="2.2"/><path d="M12 4v3M12 17v3M4.5 12h3M16.5 12h3"/><path d="M7 7l3.5 4M17 7l-3.5 4M7 17l3.5-4M17 17l-3.5-4"/>',
    ),
    both_packed: achIco('<rect x="3.5" y="7.5" width="7.5" height="10" rx="2"/><rect x="13" y="7.5" width="7.5" height="10" rx="2"/>'),
    sessions_mid: achIco('<circle cx="12" cy="12" r="8.5"/><path d="M12 12V6a6 6 0 016 6h-6"/>'),
    sessions_strong: achIco('<line x1="7" y1="7" x2="17" y2="17"/><line x1="17" y1="7" x2="7" y2="17"/>'),
    sessions_elite: achIco('<path d="M12 3v4.5M12 16.5V21M3 12h4.5M16.5 12H21"/><circle cx="12" cy="12" r="2.3"/>'),
    sessions_titan: achIco('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="20.2" cy="12" r="2"/>'),
    sessions_immortal: achIco('<circle cx="8.55" cy="12" r="5"/><circle cx="15.45" cy="12" r="5"/>'),
    time_two_h: achIco('<polyline points="2 17 7 17 10 14 13 21 17 16 22 17"/>'),
    time_three_h: achIco(
      '<path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3z"/><path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z"/>',
    ),
    time_ultra: achIco('<path d="M4 21l8-14 8 14"/><path d="M8 21l6-11 6 11"/>'),
    closer_habit: achIco('<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 12l3 3 5.5-5.5"/>'),
    time_and_games: achIco(
      '<path d="M10 3h4v6.5l4 4.5-4 4.5V21h-4v-2.5L6 14l4-4.5V3z"/><line x1="11" x2="13" y1="14" y2="14"/>',
    ),
  };

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
        title: 'За столом',
        desc: 'Зайди в комнату по коду — мафия или «Кто я?» (счётчик в этом браузере)',
        ok: anyTable >= 1,
        progress: clampPct((anyTable / 1) * 100),
      },
      {
        id: 'finisher',
        tier: 'common',
        title: 'До финиша',
        desc: 'Останься в игре, когда хост закрыл лобби (хотя бы раз)',
        ok: sc >= 1,
        progress: clampPct((sc / 1) * 100),
      },
      {
        id: 'table_regular',
        tier: 'common',
        title: 'Знакомый вход',
        desc: '10+ заходов за стол (мафия и «Кто я?» в сумме)',
        ok: anyTable >= 10,
        progress: clampPct((anyTable / 10) * 100),
      },
      {
        id: 'mafia_fan',
        tier: 'uncommon',
        title: 'Мафия не отпускает',
        desc: '5+ раз заходил в комнату мафии',
        ok: mafia >= 5,
        progress: clampPct((mafia / 5) * 100),
      },
      {
        id: 'whoami_fan',
        tier: 'uncommon',
        title: 'Кто я? — свой человек',
        desc: '5+ раз заходил в комнату «Кто я?»',
        ok: whoami >= 5,
        progress: clampPct((whoami / 5) * 100),
      },
      {
        id: 'both_games',
        tier: 'rare',
        title: 'Две игры — один игрок',
        desc: 'Попробуй и мафию, и «Кто я?» хотя бы по разу',
        ok: mafia >= 1 && whoami >= 1,
        progress: clampPct(Math.min((mafia / 1) * 50, 50) + Math.min((whoami / 1) * 50, 50)),
      },
      {
        id: 'committed',
        tier: 'uncommon',
        title: 'В деле',
        desc: '5 партий закончены вместе с лобби',
        ok: sc >= 5,
        progress: clampPct((sc / 5) * 100),
      },
      {
        id: 'soldier',
        tier: 'uncommon',
        title: 'Ветеран стола',
        desc: '10 завершённых лобби, пока ты был в комнате',
        ok: sc >= 10,
        progress: clampPct((sc / 10) * 100),
      },
      {
        id: 'veteran',
        tier: 'rare',
        title: 'Боевой склад',
        desc: '25+ партий до конца лобби',
        ok: sc >= 25,
        progress: clampPct((sc / 25) * 100),
      },
      {
        id: 'champion',
        tier: 'epic',
        title: 'Чемпион вечера',
        desc: '50+ завершённых лобби',
        ok: sc >= 50,
        progress: clampPct((sc / 50) * 100),
      },
      {
        id: 'legend_sessions',
        tier: 'legendary',
        title: 'Легенда HLOR',
        desc: '100+ завершённых лобби',
        ok: sc >= 100,
        progress: clampPct((sc / 100) * 100),
      },
      {
        id: 'time_30',
        tier: 'common',
        title: 'Перерыв на партию',
        desc: '30+ минут с активной вкладкой за столом',
        ok: pt >= 1800,
        progress: clampPct((pt / 1800) * 100),
      },
      {
        id: 'time_sink',
        tier: 'uncommon',
        title: 'Долго в игре',
        desc: '60+ минут суммарно за столами (вкладка активна)',
        ok: pt >= 3600,
        progress: clampPct((pt / 3600) * 100),
      },
      {
        id: 'night_shift',
        tier: 'rare',
        title: 'Ночная смена',
        desc: '5+ часов за столами',
        ok: pt >= 5 * 3600,
        progress: clampPct((pt / (5 * 3600)) * 100),
      },
      {
        id: 'marathon',
        tier: 'epic',
        title: 'Марафон',
        desc: '10+ часов суммарно за столами',
        ok: pt >= 10 * 3600,
        progress: clampPct((pt / (10 * 3600)) * 100),
      },
      {
        id: 'warmup_quarter',
        tier: 'common',
        title: 'Согрев',
        desc: '15+ минут за активной вкладкой за столом',
        ok: pt >= 900,
        progress: clampPct((pt / 900) * 100),
      },
      {
        id: 'table_25',
        tier: 'uncommon',
        title: 'Свои двери',
        desc: '25+ заходов за стол (мафия + «Кто я?»)',
        ok: anyTable >= 25,
        progress: clampPct((anyTable / 25) * 100),
      },
      {
        id: 'table_50',
        tier: 'rare',
        title: 'Постоянный гость',
        desc: '50+ заходов за стол всего',
        ok: anyTable >= 50,
        progress: clampPct((anyTable / 50) * 100),
      },
      {
        id: 'table_100',
        tier: 'epic',
        title: 'Зал без билета',
        desc: '100+ заходов за стол всего',
        ok: anyTable >= 100,
        progress: clampPct((anyTable / 100) * 100),
      },
      {
        id: 'mafia_double',
        tier: 'rare',
        title: 'На сцене',
        desc: '10+ заходов в комнату мафии',
        ok: mafia >= 10,
        progress: clampPct((mafia / 10) * 100),
      },
      {
        id: 'mafia_triple',
        tier: 'epic',
        title: 'Король ночи',
        desc: '20+ заходов в мафию',
        ok: mafia >= 20,
        progress: clampPct((mafia / 20) * 100),
      },
      {
        id: 'whoami_double',
        tier: 'rare',
        title: 'На подсказках',
        desc: '10+ заходов в «Кто я?»',
        ok: whoami >= 10,
        progress: clampPct((whoami / 10) * 100),
      },
      {
        id: 'whoami_triple',
        tier: 'epic',
        title: 'Мастер вопросов',
        desc: '20+ заходов в «Кто я?»',
        ok: whoami >= 20,
        progress: clampPct((whoami / 20) * 100),
      },
      {
        id: 'both_packed',
        tier: 'epic',
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
        title: 'Середина пути',
        desc: '15 завершённых лобби',
        ok: sc >= 15,
        progress: clampPct((sc / 15) * 100),
      },
      {
        id: 'sessions_strong',
        tier: 'rare',
        title: 'В бою',
        desc: '40 завершённых лобби',
        ok: sc >= 40,
        progress: clampPct((sc / 40) * 100),
      },
      {
        id: 'sessions_elite',
        tier: 'epic',
        title: 'Элита стола',
        desc: '75 завершённых лобби',
        ok: sc >= 75,
        progress: clampPct((sc / 75) * 100),
      },
      {
        id: 'sessions_titan',
        tier: 'legendary',
        title: 'Титан',
        desc: '150 завершённых лобби',
        ok: sc >= 150,
        progress: clampPct((sc / 150) * 100),
      },
      {
        id: 'sessions_immortal',
        tier: 'legendary',
        title: 'Бессмертный игрок',
        desc: '200 завершённых лобби',
        ok: sc >= 200,
        progress: clampPct((sc / 200) * 100),
      },
      {
        id: 'time_two_h',
        tier: 'uncommon',
        title: 'Два часа в эфире',
        desc: '2+ часа за столами (вкладка активна)',
        ok: pt >= 2 * 3600,
        progress: clampPct((pt / (2 * 3600)) * 100),
      },
      {
        id: 'time_three_h',
        tier: 'rare',
        title: 'Три часа подряд и не только',
        desc: '3+ часа суммарно за столами',
        ok: pt >= 3 * 3600,
        progress: clampPct((pt / (3 * 3600)) * 100),
      },
      {
        id: 'time_ultra',
        tier: 'legendary',
        title: 'Ультра-марафон',
        desc: '25+ часов за столами',
        ok: pt >= 25 * 3600,
        progress: clampPct((pt / (25 * 3600)) * 100),
      },
      {
        id: 'closer_habit',
        tier: 'uncommon',
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
        title: 'Время и партии',
        desc: '3+ часа за столом и 5+ завершённых лобби',
        ok: pt >= 3 * 3600 && sc >= 5,
        progress: clampPct(
          Math.min((pt / (3 * 3600)) * 50, 50) + Math.min((sc / 5) * 50, 50),
        ),
      },
    ];

    for (var ix = 0; ix < list.length; ix++) {
      var row = list[ix];
      row.icon = ACH_ICONS[row.id] || ACH_ICONS_DEFAULT;
    }

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
