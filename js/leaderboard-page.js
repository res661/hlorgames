/**
 * Страница топа: читает public.leaderboard_public, сортировка по вкладкам.
 */
(function () {
  'use strict';

  const REFRESH_MS = 30 * 60 * 1000;
  const LIMIT = 100;

  const tabKeys = ['total', 'mafia', 'whoami', 'time'];
  let rows = [];
  let activeTab = 'total';
  let refreshedAt = null;
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

  function setMeta() {
    const el = document.getElementById('lb-refreshed');
    if (!el) return;
    if (!refreshedAt) {
      el.textContent = '—';
      return;
    }
    try {
      const d = new Date(refreshedAt);
      el.textContent = d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      el.textContent = refreshedAt;
    }
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
      return;
    }

    renderPodium(sorted);
    renderTable(sorted, myId);
    setMeta();
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
      const first = await supabaseClient
        .from('leaderboard_public')
        .select(
          'user_id,nickname,games_mafia,games_whoami,games_other,completed_total,visits_total,play_seconds_estimate,refreshed_at',
        )
        .order('completed_total', { ascending: false })
        .limit(500);

      let data = first.data;
      let error = first.error;

      if (error && leaderboardRestUnreachable(error)) {
        const fb = await supabaseClient.rpc('hlor_leaderboard_list', {
          p_limit: 500,
        });
        if (!fb.error) {
          error = null;
          data = fb.data;
        }
      }

      if (error) throw error;

      rows = Array.isArray(data) ? data : [];
      refreshedAt =
        rows.length === 0
          ? null
          : rows.reduce((best, r) => {
              const t = r.refreshed_at;
              if (!t) return best;
              if (!best || t > best) return t;
              return best;
            }, null);

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
            '1) <strong>Table Editor</strong> → <code style="color:inherit">leaderboard_public</code> → включи доступ к <strong>Data API</strong>, если там выключен / бейдж «Not exposed». ' +
            '2) Запусти <code style="color:inherit">supabase/leaderboard_expose_existing.sql</code> и <code style="color:inherit">NOTIFY pgrst, \'reload schema\';</code>. ' +
            '3) Обнови страницу топа — клиент уже пробует и таблицу, и функцию-костыль <code style="color:inherit">hlor_leaderboard_list</code>.';
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
