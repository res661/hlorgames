/**
 * История комнат в профиле: upsert при заходе, отметка finished при закрытии лобби.
 * На mafia-play передавай userId вторым аргументом (нет window.currentUser).
 * Требует таблицы user_lobby_history (см. supabase/user_lobby_history.sql).
 */
(function () {
  'use strict';

  function sessionKeyLobby(userId, code) {
    return (
      'hlor_hist_snap_' +
      String(userId || '').replace(/\W/g, '') +
      '_' +
      String(code || '').replace(/\W/g, '')
    );
  }

  function resolveUserId(forced) {
    if (forced != null && forced !== '') return String(forced);
    if (typeof window.currentUser !== 'undefined' && window.currentUser && window.currentUser.id) {
      return String(window.currentUser.id);
    }
    return null;
  }

  /** Запись визита (не чаще 1 раза за сессию браузера на комнату) */
  window.maybeUpsertLobbyHistory = async function maybeUpsertLobbyHistory(row, actingUserId) {
    const uid = resolveUserId(actingUserId);
    if (!window.supabaseClient || !uid || !row || !row.code || !row.id) return;

    try {
      if (typeof sessionStorage !== 'undefined') {
        const sk = sessionKeyLobby(uid, String(row.code).toUpperCase());
        if (sessionStorage.getItem(sk)) return;
      }
    } catch (_) {}

    const codeUp = String(row.code || '').trim().toUpperCase();
    const wasHost = !!(row.host_id != null && String(row.host_id) === String(uid));
    const nowIso = new Date().toISOString();
    const payload = {
      user_id: uid,
      lobby_id: row.id,
      lobby_code: codeUp,
      game: row.game || 'mafia',
      room_name: row.name || null,
      was_host: wasHost,
      lobby_status_last: row.status || 'waiting',
      last_seen_at: nowIso,
    };

    try {
      const { error } = await window.supabaseClient
        .from('user_lobby_history')
        .upsert(payload, { onConflict: 'user_id,lobby_code' });

      if (error) {
        const msg = String(error.message || error.code || '');
        if (
          msg.includes('user_lobby_history') ||
          msg.includes('42P01') ||
          msg.includes('schema cache')
        ) {
          if (!window.__hlorHistorySchemaWarned) {
            window.__hlorHistorySchemaWarned = true;
            console.warn(
              '[lobby-history] Нет таблицы user_lobby_history — см. supabase/user_lobby_history.sql',
            );
          }
        } else {
          console.warn('[lobby-history]', error);
        }
        return;
      }
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(sessionKeyLobby(uid, codeUp), '1');
        }
      } catch (_) {}
    } catch (e) {
      console.warn('[lobby-history]', e);
    }
  };

  window.markLobbyHistoryFinished = async function markLobbyHistoryFinished(lobbyId, lobbyCode, actingUserId) {
    const uid = resolveUserId(actingUserId);
    if (!window.supabaseClient || !uid) return;
    const nowIso = new Date().toISOString();
    const patch = {
      lobby_status_last: 'ended',
      finished_at: nowIso,
      last_seen_at: nowIso,
    };
    try {
      const codeUp = lobbyCode ? String(lobbyCode).trim().toUpperCase() : '';
      if (codeUp) {
        await window.supabaseClient
          .from('user_lobby_history')
          .update(patch)
          .eq('user_id', uid)
          .eq('lobby_code', codeUp);
        return;
      }
      if (lobbyId) {
        await window.supabaseClient
          .from('user_lobby_history')
          .update(patch)
          .eq('user_id', uid)
          .eq('lobby_id', lobbyId);
      }
    } catch (_) {}
  };
})();
