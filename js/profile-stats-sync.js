/**
 * Пишет локальную статистику профиля (hlorStats) в profiles.* для общего топа.
 * Игра без auth.js использует getSession(); слияние при входе — в auth.js.
 */
(function () {
  'use strict';

  var pushTimer = null;
  var DEBOUNCE_MS = 900;

  function clampStats(s) {
    return {
      stat_mafia_opens: Math.min(9999999, Math.max(0, Math.floor(Number(s.mafiaTableOpens) || 0))),
      stat_whoami_opens: Math.min(9999999, Math.max(0, Math.floor(Number(s.whoamiTableOpens) || 0))),
      stat_sessions_completed: Math.min(9999999, Math.max(0, Math.floor(Number(s.sessionsCompleted) || 0))),
      stat_play_seconds: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(s.playTimeSeconds) || 0))),
    };
  }

  window.hlorMergeProfileStatsIntoLocal = function (profile) {
    if (!profile || !window.hlorStats) return;
    var s = hlorStats.load();
    function mx(a, b) {
      return Math.max(Number(a) || 0, Number(b) || 0);
    }
    var next = {
      version: s.version,
      mafiaTableOpens: mx(s.mafiaTableOpens, profile.stat_mafia_opens),
      whoamiTableOpens: mx(s.whoamiTableOpens, profile.stat_whoami_opens),
      sessionsCompleted: mx(s.sessionsCompleted, profile.stat_sessions_completed),
      playTimeSeconds: mx(s.playTimeSeconds, profile.stat_play_seconds),
    };
    hlorStats.save(next);
  };

  async function pushStatsInner() {
    var client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    if (!client || !window.hlorStats) return;
    var sessRes = await client.auth.getSession();
    var uid = sessRes?.data?.session?.user?.id;
    if (!uid) return;
    var patch = clampStats(hlorStats.load());
    try {
      await client.from('profiles').update(patch).eq('id', uid);
    } catch (_) {}
  }

  window.hlorPushStatsToProfileImmediate = function () {
    return pushStatsInner();
  };

  /** После save(localStorage) — отложенная отправка на сервер. */
  window.hlorPushStatsToProfile = function () {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      void pushStatsInner();
    }, DEBOUNCE_MS);
  };
})();
