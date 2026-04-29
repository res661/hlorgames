/**
 * LOBBY-SEAT-UTILS.JS — общая логика слотов для lobby.js и game.js
 * Порядок мест: по очереди входа в комнату; host_plays:false — создатель без места (только ведущий у стола не сидит).
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

  /**
   * @param {Array} players
   * @param {number} maxP число мест за столом (включая +1 место хоста, если включён host_plays у лобби)
   * @param {{host_id?:string,host_plays?:boolean,syncMafiaGrid?:boolean}|null} lobbyCtx
   * syncMafiaGrid — для мафии: mafia_slot = индекс слота сетки (как slot в лобби).
   */
  function normalizeLobbySlotsForSave(players, maxP, lobbyCtx) {
    const list = dedupeLobbyPlayers(players);
    const hid = lobbyCtx && lobbyCtx.host_id != null ? String(lobbyCtx.host_id) : null;
    const hostPlays = !(lobbyCtx && lobbyCtx.host_plays === false);

    const bySlot = new Map();
    for (const p of list) {
      if (hid && !hostPlays && String(p.id) === hid) {
        p.slot = null;
        continue;
      }
      const s = p.slot;
      if (s === null || s === undefined) continue;
      if (typeof s !== 'number' || s < 0 || s >= maxP || bySlot.has(s)) {
        p.slot = null;
      } else {
        bySlot.set(s, p);
      }
    }
    for (const p of list) {
      if (hid && !hostPlays && String(p.id) === hid) {
        p.slot = null;
        continue;
      }
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
        if (hid && !hostPlays && String(p.id) === hid) {
          delete p.mafia_slot;
          continue;
        }
        if (typeof p.slot === 'number' && p.slot >= 0 && p.slot < maxP) {
          p.mafia_slot = p.slot;
        } else if (typeof p.slot !== 'number' || Number.isNaN(p.slot)) {
          delete p.mafia_slot;
        }
      }
    }
    return list;
  }

  global.LobbySeatUtils = { dedupeLobbyPlayers, normalizeLobbySlotsForSave };
})(typeof window !== 'undefined' ? window : globalThis);
