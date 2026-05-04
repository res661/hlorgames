/**
 * Страница топа: читает public.leaderboard_public, сортировка по вкладкам.
 */
(function () {
  'use strict';

  const REFRESH_MS = 30 * 60 * 1000;
  const LIMIT = 100;
  /** PostgREST может отдавать «schema cache» секунды после NOTIFY/DDL — повторяем запрос. */
  const SCHEMA_FETCH_MAX_ATTEMPTS = 8;
  const SCHEMA_FETCH_RETRY_MS = 1600;
  /** Если сеть обрывается или fetch подвисает — иначе «Загружаем…» висит вечно без finally. */
  const FETCH_ATTEMPT_DEADLINE_MS = 22000;

  const tabKeys = ['total', 'mafia', 'whoami', 'time'];
  let rows = [];
  let activeTab = 'total';
  let pollTimer = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatDuration(sec) {
    const n = Math.max(0, Number(sec) || 0);
    if (n < 3600) return Math.round(n / 60) + ' мин';
    const h = Math.floor(n / 3600);
    const m = Math.round((n % 3600) / 60);
    return h + ' ч' + (m ? ' ' + m + ' м' : '');
  }

  function sortValue(row, tab) {
    if (tab === 'mafia') return row.games_mafia || 0;
    if (tab === 'whoami') return row.games_whoami || 0;
    if (tab === 'time') return row.play_seconds_estimate || 0;
    return row.completed_total || 0;
  }

  function metricLabel(tab) {
    if (tab === 'time') return 'Время (оценка)';
    return 'Завершённых лобби';
  }

  function initialLetter(nick) {
    const c = String(nick || '?').trim()[0];
    return c ? c.toUpperCase() : '?';
  }

  /** Одна строка сводки под заголовком (без технических таймштампов для игроков). */
  function setSummary(sortedSlice) {
    const el = document.getElementById('lb-summary');
    if (!el) return;
    if (!sortedSlice || !sortedSlice.length) {
      el.textContent = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    let sumDone = 0;
    let sumMafia = 0;
    let sumWho = 0;
    for (const r of sortedSlice) {
      sumDone += Number(r.completed_total) || 0;
      sumMafia += Number(r.games_mafia) || 0;
      sumWho += Number(r.games_whoami) || 0;
    }
    el.textContent =
      'Показано до ' +
      LIMIT +
      ' мест: ' +
      sortedSlice.length +
      ' игроков · завершённых лобби (сумма по списку): ' +
      sumDone +
      ' · мафия: ' +
      sumMafia +
      ' · «Кто я?»: ' +
      sumWho;
  }

  function renderPodium(sorted) {
    const wrap = document.getElementById('lb-podium');
    if (!wrap) return;
    wrap.innerHTML = '';
    const top = [sorted[1], sorted[0], sorted[2]];
    const tiers = ['silver', 'gold', 'bronze'];
    const medals = ['2', '🏆', '3'];
    for (let i = 0; i < 3; i++) {
      const row = top[i];
      const card = document.createElement('div');
      card.className = 'lb-podium-card lb-podium-card--' + tiers[i];
      if (!row) {
        card.innerHTML =
          '<div class="lb-podium-rank">' +
          medals[i] +
          '</div><div class="lb-podium-name" style="color:var(--text-muted)">—</div>';
        wrap.appendChild(card);
        continue;
      }
      const val = sortValue(row, activeTab);
      const display =
        activeTab === 'time' ? formatDuration(val) : String(val);
      card.innerHTML =
        '<div class="lb-podium-rank">' +
        medals[i] +
        '</div>' +
        '<div class="lb-podium-avatar">' +
        esc(initialLetter(row.nickname)) +
        '</div>' +
        '<div class="lb-podium-name">' +
        esc(row.nickname) +
        '</div>' +
        '<div class="lb-podium-value">' +
        esc(display) +
        '</div>' +
        '<div class="lb-podium-hint">' +
        esc(metricLabel(activeTab)) +
        '</div>';
      wrap.appendChild(card);
    }
  }

  function initLeaderboardNavbar() {
    const burgerBtn = document.getElementById('burgerBtn');
    const navLinks = document.getElementById('navLinks');
    const navAuth = document.getElementById('navAuth');

    burgerBtn?.addEventListener('click', () => {
      navLinks?.classList.toggle('open');
      navAuth?.classList.toggle('open');
    });
    document.querySelectorAll('.lb-page .nav-link').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks?.classList.remove('open');
        navAuth?.classList.remove('open');
      });
    });

    window.addEventListener('scroll', () => {
      const navbar = document.getElementById('navbar');
      if (!navbar) return;
      navbar.classList.toggle('navbar--scrolled', window.scrollY > 20);
    });
  }

  function renderTable(sorted, myId) {
    const body = document.getElementById('lb-rows');
    if (!body) return;
    body.innerHTML = '';

    sorted.slice(3).forEach((row, idx) => {
      const rank = idx + 4;
      const isMe = myId && String(row.user_id) === String(myId);
      const val = sortValue(row, activeTab);
      const mainDisplay = activeTab === 'time' ? formatDuration(val) : String(val);
      const tr = document.createElement('div');
      tr.className = 'lb-row' + (isMe ? ' lb-row--me' : '');
      tr.innerHTML =
        '<div class="lb-rank-cell">#' +
        rank +
        '</div>' +
        '<div class="lb-name-cell">' +
        '<span class="lb-mini-av">' +
        esc(initialLetter(row.nickname)) +
        '</span>' +
        '<span class="lb-nick" title="' +
        esc(row.nickname) +
        '">' +
        esc(row.nickname) +
        '</span>' +
        '</div>' +
        '<div class="lb-num lb-num--hi">' +
        esc(mainDisplay) +
        '</div>' +
        '<div class="lb-num">' +
        esc(String(row.completed_total ?? 0)) +
        '</div>' +
        '<div class="lb-num">' +
        esc(formatDuration(row.play_seconds_estimate || 0)) +
        '</div>';
      body.appendChild(tr);
    });
  }

  function render() {
    const sorted = rows
      .map((r) => ({ ...r }))
      .sort((a, b) => sortValue(b, activeTab) - sortValue(a, activeTab))
      .slice(0, LIMIT);

    document.querySelectorAll('.lb-tab').forEach((btn) => {
      const k = btn.getAttribute('data-tab');
      btn.classList.toggle('lb-tab--active', k === activeTab);
    });

    const myId = typeof currentUser !== 'undefined' && currentUser?.id ? currentUser.id : null;

    if (!sorted.length) {
      document.getElementById('lb-podium').innerHTML = '';
      const body = document.getElementById('lb-rows');
      if (body) body.innerHTML = '';
      setSummary([]);
      return;
    }

    renderPodium(sorted);
    renderTable(sorted, myId);
    setSummary(sorted);
  }

  function leaderboardRestUnreachable(err) {
    if (!err) return false;
    const raw = `${err.code || ''} ${err.message || ''} ${err.details || ''}`.toLowerCase();
    const status = Number(err.status || err.statusCode || 0);
    if (status === 404 || status === 406) return true;
    return (
      /schema\s*cache/.test(raw) ||
      /could not find/.test(raw) ||
      /\b404\b/.test(raw) ||
      /pgrst205|pgrst204|42p01/i.test(raw)
    );
  }

  function isRoutineMissing(err) {
    if (!err) return false;
    const raw = `${err.message || ''} ${err.details || ''}`.toLowerCase();
    return (
      /routine .*does not exist/.test(raw) ||
      /function .*does not exist/.test(raw) ||
      /could not find the function/.test(raw) ||
      /\b42704\b/.test(String(err.code || ''))
    );
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const e = new Error('Таймаут запроса к серверу');
        e.code = 'TIMEOUT';
        reject(e);
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  function isFetchLikelyNetwork(err) {
    if (!err) return false;
    const raw = `${err.code || ''} ${err.message || ''} ${err.details || ''}`.toLowerCase();
    if (String(err.code || '').toUpperCase() === 'TIMEOUT') return true;
    return (
      /failed to fetch|networkerror|network request failed|load failed|internet disconnected|err_network/i.test(
        raw,
      ) || /таймаут/i.test(raw)
    );
  }

  /**
   * Один проход: сначала таблица (часто проще для REST), затем RPC-костыль при тех же типах ошибок.
   */
  async function fetchBoardOnce() {
    let combinedError = null;

    const tblRes = await supabaseClient
      .from('leaderboard_public')
      .select(
        'user_id,nickname,games_mafia,games_whoami,games_other,completed_total,visits_total,play_seconds_estimate,refreshed_at',
      )
      .order('completed_total', { ascending: false })
      .limit(500);

    if (!tblRes.error) {
      return { data: tblRes.data, error: null };
    }
    combinedError = tblRes.error;

    const tryRpc =
      leaderboardRestUnreachable(tblRes.error) || isRoutineMissing(tblRes.error);

    if (tryRpc) {
      const rpcRes = await supabaseClient.rpc('hlor_leaderboard_list', {
        p_limit: 500,
      });
      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        return { data: rpcRes.data, error: null };
      }
      if (!combinedError || leaderboardRestUnreachable(combinedError)) {
        combinedError = rpcRes.error || combinedError;
      }
    }

    return { data: null, error: combinedError };
  }

  async function fetchBoard() {
    const errEl = document.getElementById('lb-error');
    const loading = document.getElementById('lb-loading');
    if (loading) loading.classList.remove('hidden');
    if (errEl) errEl.classList.add('hidden');

    if (!window.supabaseClient) {
      if (loading) loading.classList.add('hidden');
      if (errEl) {
        errEl.textContent =
          'Нет подключения к серверу. Проверь js/supabase-client.js и настройки проекта.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    try {
      let data = null;
      let combinedError = null;

      for (let attempt = 0; attempt < SCHEMA_FETCH_MAX_ATTEMPTS; attempt++) {
        let once;
        try {
          once = await withTimeout(fetchBoardOnce(), FETCH_ATTEMPT_DEADLINE_MS);
        } catch (e) {
          once = { data: null, error: e };
        }
        if (!once.error) {
          data = once.data;
          combinedError = null;
          break;
        }
        combinedError = once.error;
        const retry =
          attempt < SCHEMA_FETCH_MAX_ATTEMPTS - 1 &&
          (leaderboardRestUnreachable(combinedError) || isFetchLikelyNetwork(combinedError));
        if (!retry) break;
        await delay(SCHEMA_FETCH_RETRY_MS);
      }

      if (combinedError) throw combinedError;

      rows = Array.isArray(data) ? data : [];

      const empty = document.getElementById('lb-empty');
      const list = document.getElementById('lb-board');
      if (!rows.length) {
        empty?.classList.remove('hidden');
        list?.classList.add('hidden');
      } else {
        empty?.classList.add('hidden');
        list?.classList.remove('hidden');
        render();
      }
    } catch (e) {
      console.warn('[leaderboard]', e);
      if (errEl) {
        const msg = String((e && e.message) || e);
        const unreachable = leaderboardRestUnreachable(e);

        let hint =
          'Если таблицы ещё нет — выполни скрипт <code style="color:inherit">supabase/leaderboard_schema.sql</code>, затем ' +
          '<code style="color:inherit">select public.leaderboard_refresh_stats();</code>';

        if (
          /routine .*does not exist|function .*does not exist|hlor_leaderboard_list/i.test(msg) ||
          /could not find the function/i.test(msg)
        ) {
          hint =
            'Не создана функция <code style="color:inherit">hlor_leaderboard_list</code>. Выполни <code style="color:inherit">supabase/leaderboard_expose_existing.sql</code> (или заново полный <code style="color:inherit">leaderboard_schema.sql</code>), затем NOTIFY.';
        } else if (unreachable || /schema\s*cache|could not find (the )?(relation|table)/i.test(msg)) {
          hint =
            'Страница уже несколько раз подряд пробует и <code style="color:inherit">leaderboard_public</code>, и <code style="color:inherit">hlor_leaderboard_list</code> — если ошибка всё равно: ' +
            '1) <strong>Table Editor</strong> → <code style="color:inherit">leaderboard_public</code> → включи доступ к Data API (нет бейджа «Not exposed»). ' +
            '2) <strong>Project Settings → Data API</strong> — среди схем есть <code style="color:inherit">public</code>. ' +
            '3) SQL Editor: целиком <code style="color:inherit">supabase/leaderboard_expose_existing.sql</code>, затем ещё раз отдельно <code style="color:inherit">NOTIFY pgrst, \'reload schema\';</code> (кэш шлюза может подтягиваться с задержкой). ' +
            '4) Если не помогло — <strong>Pause project</strong> → <strong>Resume</strong>.';
        } else if (isFetchLikelyNetwork(e)) {
          hint =
            'Похоже на проблему сети (Wi‑Fi, VPN, блокировщик). В консоли часто <code style="color:inherit">ERR_INTERNET_DISCONNECTED</code> — это реальный обрыв. Проверь интернет и обнови страницу. Если сеть стабильна, но есть <strong>404</strong> на запросах к Supabase — сверь URL и anon-ключ в <code style="color:inherit">js/supabase-client.js</code> с тем же проектом в Dashboard, где есть таблица топа.';
        }

        errEl.innerHTML =
          esc(msg) + '<br/><br/><span style="color:var(--text-muted)">' + hint + '</span>';
        errEl.classList.remove('hidden');
      }
      document.getElementById('lb-board')?.classList.add('hidden');
      document.getElementById('lb-empty')?.classList.add('hidden');
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  }

  function bindTabs() {
    document.querySelectorAll('.lb-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-tab');
        if (tabKeys.includes(k)) {
          activeTab = k;
          render();
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLeaderboardNavbar();
    const prevAuthCb = window._onAuthUpdate;
    window._onAuthUpdate = function () {
      if (typeof prevAuthCb === 'function') prevAuthCb();
      if (rows.length) render();
    };

    bindTabs();
    void fetchBoard();
    pollTimer = setInterval(() => void fetchBoard(), REFRESH_MS);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void fetchBoard();
  });
})();
