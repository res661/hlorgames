/**
 * LOBBY-SEAT-UTILS.JS — слоты лобби для lobby.js / game.js / mafia-play.js
 *
 * Правило: host_id живёт только в строке лобби (host_id, host_name).
 * Массив players[] — только участники за столом; хост туда НЕ включается.
 * Слоты 0…max−1 назначаются по очереди тем, у кого ещё нет места.
 */

(function (global) {
  'use strict';

  function dedupeLobbyPlayers(players) {
    const m = new Map();
    for (const p of players || []) {
      if (!p || p.id == null) continue;
      const id = String(p.id);
      const prev = m.get(id);
      if (!prev) {
        m.set(id, {
          ...(typeof p === 'object' ? { ...p } : {}),
          id: p.id,
          nickname: p.nickname || 'Игрок',
          ready: !!p.ready,
          slot: Object.prototype.hasOwnProperty.call(p, 'slot') ? p.slot : undefined,
        });
      } else {
        const sA = prev.slot;
        const sB = Object.prototype.hasOwnProperty.call(p, 'slot') ? p.slot : undefined;
        let slot = sA;
        if (sA === undefined) slot = sB;
        else if (sB !== undefined && sB !== null && (sA === null || sA === undefined)) slot = sB;
        m.set(id, {
          ...prev,
          ...p,
          nickname: (p.nickname || prev.nickname || 'Игрок'),
          ready: p.ready !== undefined ? !!p.ready : prev.ready,
          slot,
        });
      }
    }
    return [...m.values()];
  }

  /** Убрать запись хоста из массива игроков (ведущий не в players[]). */
  function stripHostFromLobbyPlayers(players, hostId) {
    if (hostId == null || hostId === '') return dedupeLobbyPlayers(players);
    const hid = String(hostId);
    return dedupeLobbyPlayers(players || []).filter((p) => p && String(p.id) !== hid);
  }

  /**
   * @param {Array} players
   * @param {number} maxP число мест за столом
   * @param {{host_id?:string,syncMafiaGrid?:boolean}|null} lobbyCtx — host_id обязателен для фильтрации хоста из входного массива
   */
  function normalizeLobbySlotsForSave(players, maxP, lobbyCtx) {
    const hid = lobbyCtx && lobbyCtx.host_id != null ? String(lobbyCtx.host_id) : null;
    let list = hid ? stripHostFromLobbyPlayers(players, lobbyCtx.host_id) : dedupeLobbyPlayers(players);

    for (const p of list) {
      if (p.slot === null || p.slot === undefined) continue;
      const n = Number(p.slot);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        p.slot = null;
      } else {
        p.slot = n;
      }
    }

    const bySlot = new Map();
    for (const p of list) {
      const s = p.slot;
      if (s === null || s === undefined) continue;
      if (typeof s !== 'number' || s < 0 || s >= maxP || bySlot.has(s)) {
        p.slot = null;
      } else {
        bySlot.set(s, p);
      }
    }
    for (const p of list) {
      if (p.slot !== undefined && p.slot !== null) continue;
      let free = 0;
      while (free < maxP && bySlot.has(free)) free++;
      if (free < maxP) {
        p.slot = free;
        bySlot.set(free, p);
      } else {
        p.slot = null;
      }
    }
    if (lobbyCtx && lobbyCtx.syncMafiaGrid === true) {
      for (const p of list) {
        if (typeof p.slot === 'number' && p.slot >= 0 && p.slot < maxP) {
          p.mafia_slot = p.slot;
        } else {
          delete p.mafia_slot;
        }
      }
    }
    return list;
  }

  global.LobbySeatUtils = {
    dedupeLobbyPlayers,
    stripHostFromLobbyPlayers,
    normalizeLobbySlotsForSave,
  };
})(typeof window !== 'undefined' ? window : globalThis);
