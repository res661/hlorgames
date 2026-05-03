/**
 * Локальная геймификация (localStorage): стол мафии, время, партии до закрытия лобби, достижения.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hlor_player_stats_v1';

  function defaults() {
    return {
      version: 2,
      mafiaTableOpens: 0,
      sessionsCompleted: 0,
      playTimeSeconds: 0,
    };
  }

  function migrate(raw) {
    var o = raw && typeof raw === 'object' ? raw : {};
    var d = defaults();
    return {
      version: 2,
      mafiaTableOpens: Number(o.mafiaTableOpens) || 0,
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
  }

  function recordTableOpen(lobbyCode) {
    var code = String(lobbyCode || '').trim().toUpperCase();
    if (!code) return;
    var sk = 'hlor_stats_open_' + code;
    if (sessionStorage.getItem(sk)) return;
    sessionStorage.setItem(sk, '1');
    var stats = load();
    stats.mafiaTableOpens += 1;
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

  function achievementDefs(stats) {
    var s = Object.assign({}, defaults(), stats || {});
    var sc = s.sessionsCompleted || 0;
    return [
      {
        id: 'first_visit',
        icon: '🎲',
        title: 'За столом',
        desc: 'Один раз зайди в мафию с кодом комнаты на этой сессии',
        ok: (s.mafiaTableOpens || 0) >= 1,
      },
      {
        id: 'finisher',
        icon: '🏁',
        title: 'До финиша лобби',
        desc: 'Хоть раз останься за столом, когда хост завершил комнату',
        ok: sc >= 1,
      },
      {
        id: 'soldier',
        icon: '🃏',
        title: 'Ветеран',
        desc: '10 завершённых лобби, пока ты был за столом',
        ok: sc >= 10,
      },
      {
        id: 'time_sink',
        icon: '⏱️',
        title: 'Долго в игре',
        desc: '60+ минут с активным открытым столом мафии',
        ok: (s.playTimeSeconds || 0) >= 3600,
      },
      {
        id: 'marathon',
        icon: '🌙',
        title: 'Ночная смена',
        desc: '5+ часов суммарно за столами',
        ok: (s.playTimeSeconds || 0) >= 5 * 3600,
      },
      {
        id: 'steady',
        icon: '📊',
        title: 'Стабильно',
        desc: '10+ партий до конца — продолжаем набивать счётчик',
        ok: sc >= 25,
      },
    ];
  }

  /** Среднее время на одну закрытую комнату (грубо, по суммарному времени мафии) */
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
