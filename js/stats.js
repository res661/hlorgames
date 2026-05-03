/**
 * Локальная геймификация (localStorage): визиты к столу, время в мафии, партии до конца лобби, победы по состоянию стола.
 * Синхронизация между устройствами — отдельной задачей (нужно поле в profiles в Supabase).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'hlor_player_stats_v1';

  function defaults() {
    return {
      version: 1,
      mafiaTableOpens: 0,
      sessionsCompleted: 0,
      wins: 0,
      losses: 0,
      undecided: 0,
      playTimeSeconds: 0,
      winStreak: 0,
      bestWinStreak: 0,
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var o = JSON.parse(raw);
      return Object.assign({}, defaults(), o);
    } catch (_) {
      return defaults();
    }
  }

  function save(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (_) {}
  }

  /** Команда по названию роли (для побед при закрытии лобби) */
  function playerFaction(role) {
    if (!role) return null;
    if (role === 'Маньяк') return 'maniac';
    if (role === 'Мафия' || role === 'Дон мафии') return 'mafia';
    return 'town';
  }

  /**
   * Грубая оценка исхода по живым слотам (когда хост завершил комнату).
   */
  function winningFaction(slots, activeSlots) {
    var n = Math.min(Number(activeSlots) || 12, (slots && slots.length) || 12);
    var mafia = 0,
      town = 0,
      maniac = 0,
      i,
      s,
      r;
    for (i = 0; i < n; i++) {
      s = slots[i];
      if (!s || s.status !== 'alive') continue;
      r = s.role || '';
      if (r === 'Маньяк') maniac++;
      else if (r === 'Мафия' || r === 'Дон мафии') mafia++;
      else if (r) town++;
    }

    if (mafia > 0 && mafia >= town) return 'mafia';
    if (mafia === 0 && maniac > 0 && town === 0) return maniac === 1 ? 'maniac' : 'unknown';
    if (mafia === 0 && maniac > 0 && town > 0) return 'unknown';
    if (mafia === 0) return 'town';
    return 'unknown';
  }

  /** Один счётчик «посетил стол» за сессию браузера на комнату */
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

  /** Хост закрыл лобби — одна запись на комнату за сессию */
  function recordLobbyEnd(payload) {
    var code = String((payload && payload.lobbyCode) || '').trim().toUpperCase();
    if (!code) return;
    var sk = 'hlor_stats_ended_' + code;
    if (sessionStorage.getItem(sk)) return;
    sessionStorage.setItem(sk, '1');

    var slots = payload.slots || [];
    var activeSlots = payload.activeSlots;
    var mySlot = typeof payload.mySlot === 'number' ? payload.mySlot : -1;

    var stats = load();
    stats.sessionsCompleted += 1;

    var myRole =
      mySlot >= 0 && slots[mySlot] && slots[mySlot].role ? slots[mySlot].role : null;
    var fac = winningFaction(slots, activeSlots);
    var mine = playerFaction(myRole);

    if (mySlot < 0 || !mine) {
      save(stats);
      return;
    }

    if (fac === 'unknown') {
      stats.undecided += 1;
      save(stats);
      return;
    }

    if (mine === fac) {
      stats.wins += 1;
      stats.winStreak += 1;
      if (stats.winStreak > stats.bestWinStreak) stats.bestWinStreak = stats.winStreak;
    } else {
      stats.losses += 1;
      stats.winStreak = 0;
    }
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
    return [
      {
        id: 'first_visit',
        icon: '🎲',
        title: 'За столом',
        desc: 'Открой мафию с кодом комнаты',
        ok: (s.mafiaTableOpens || 0) >= 1,
      },
      {
        id: 'soldier',
        icon: '🃏',
        title: 'Ветеран',
        desc: '10 партий закрытых хостом (ты был за столом)',
        ok: (s.sessionsCompleted || 0) >= 10,
      },
      {
        id: 'finisher',
        icon: '🏁',
        title: 'До финала',
        desc: 'Дождись пока комнату завершат',
        ok: (s.sessionsCompleted || 0) >= 1,
      },
      {
        id: 'winner',
        icon: '🏆',
        title: 'На стороне сильных',
        desc: 'Хотя бы одна победа по нашей простой модели результата',
        ok: (s.wins || 0) >= 1,
      },
      {
        id: 'streak',
        icon: '🔥',
        title: 'Зачёт серии',
        desc: '3 победы подряд (пока считаем подряд в одной вкладке)',
        ok: (s.bestWinStreak || 0) >= 3,
      },
      {
        id: 'time_sink',
        icon: '⏱️',
        title: 'Не жаль времени',
        desc: '60+ минут в мафии (вкладка на столе активна)',
        ok: (s.playTimeSeconds || 0) >= 3600,
      },
    ];
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
  };
})();
