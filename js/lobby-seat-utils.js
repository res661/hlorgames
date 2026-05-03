/**
 * LOBBY-SEAT-UTILS.JS — слоты лобби для lobby.js / game.js / mafia-play.js
 *
 * Правило: host_id живёт только в строке лобби (host_id, host_name).
 * Массив players[] — только участники за столом; хост туда НЕ включается.
 * Слоты 0…max−1 назначаются по очереди тем, у кого ещё нет места.
 * Порядок очереди: поле joined_at (мс или ISO) при входе; без него — порядок в массиве из БД.
 */

(function (global) {
  'use strict';

  function parseJoinedAtMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return Number.isNaN(t) ? null : t;
    }
    return null;
  }

  /** Раньше вошёл — раньше в очереди на свободные слоты (при слиянии дублей id). */
  function coalesceJoinedAt(prevVal, nextVal) {
    const a = parseJoinedAtMs(prevVal);
    const b = parseJoinedAtMs(nextVal);
    if (a == null && b == null) return undefined;
    if (a == null) return nextVal;
    if (b == null) return prevVal;
    return a <= b ? prevVal : nextVal;
  }

  /** Сравнение массива игроков только по id + местам (для проверки «нужен ли UPDATE»). */
  function stableLobbyPlayersSeatsKey(players) {
    return JSON.stringify(
      [...(players || [])]
        .filter((p) => p && p.id != null)
        .map((p) => ({
          id: String(p.id),
          slot: p.slot ?? null,
          mafia_slot: p.mafia_slot ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  function dedupeLobbyPlayers(players) {
    const m = new Map();
    for (const p of players || []) {
      if (!p || p.id == null) continue;
      const id = String(p.id);
      const prev = m.get(id);
      if (!prev) {
        const row = {
          ...(typeof p === 'object' ? { ...p } : {}),
          id: p.id,
          nickname: p.nickname || 'Игрок',
          ready: !!p.ready,
          slot: Object.prototype.hasOwnProperty.call(p, 'slot') ? p.slot : undefined,
        };
        const j = coalesceJoinedAt(undefined, p.joined_at);
        if (j !== undefined) row.joined_at = j;
        else delete row.joined_at;
        m.set(id, row);
      } else {
        const sA = prev.slot;
        const sB = Object.prototype.hasOwnProperty.call(p, 'slot') ? p.slot : undefined;
        let slot = sA;
        if (sA === undefined) slot = sB;
        else if (sB !== undefined && sB !== null && (sA === null || sA === undefined)) slot = sB;
        const merged = {
          ...prev,
          ...p,
          nickname: p.nickname || prev.nickname || 'Игрок',
          ready: p.ready !== undefined ? !!p.ready : prev.ready,
          slot,
        };
        const j = coalesceJoinedAt(prev.joined_at, p.joined_at);
        if (j !== undefined) merged.joined_at = j;
        else delete merged.joined_at;
        m.set(id, merged);
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

    /* Из БД часто приходит только mafia_slot — без этого слот остаётся пустым и лобби «не видит» занятость. */
    for (const p of list) {
      if ((p.slot === null || p.slot === undefined) && p.mafia_slot != null && p.mafia_slot !== '') {
        const mn = Number(p.mafia_slot);
        if (Number.isFinite(mn) && Number.isInteger(mn)) p.slot = mn;
      }
    }

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
    const needSeat = list
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.slot === null || p.slot === undefined);
    needSeat.sort((a, b) => {
      const ta = parseJoinedAtMs(a.p.joined_at);
      const tb = parseJoinedAtMs(b.p.joined_at);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      if (ta != null && tb == null) return -1;
      if (ta == null && tb != null) return 1;
      return a.idx - b.idx;
    });
    for (const { p } of needSeat) {
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
    stableLobbyPlayersSeatsKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
