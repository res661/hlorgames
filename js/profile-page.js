/**
 * profile.html — навигация и дашборд hlorStats
 */

function renderProfileHero() {
  const nameEl = document.getElementById('pf-display-name');
  const emailEl = document.getElementById('pf-email');
  const avatarEl = document.getElementById('pf-hero-avatar');
  const guestNote = document.getElementById('pf-guest-note');
  const u = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
  const email = u?.email || '';
  guestNote?.classList.toggle('hidden', !!u);

  if (emailEl) {
    emailEl.textContent = email || 'Войди в аккаунт — сохранится ник, аватар и роль между устройствами';
    emailEl.style.opacity = email ? '' : '0.82';
  }

  if (avatarEl) {
    if (typeof window.hlorBuildAvatarInnerHtml === 'function' && u) {
      avatarEl.innerHTML = window.hlorBuildAvatarInnerHtml(u);
    } else {
      avatarEl.textContent = '👋';
    }
    avatarEl.classList.toggle('pf-hero__avatar--guest', !u);
  }

  if (nameEl) {
    nameEl.textContent = u?.nickname || 'Игрок';
  }
}

function renderProfileDashboard() {
  renderProfileHero();
  const hs = window.hlorStats;
  if (!hs) return;
  const s = hs.load();

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null ? String(val) : '—';
  };

  const opens = s.mafiaTableOpens ?? 0;
  const sc = s.sessionsCompleted ?? 0;
  setTxt('pf-stat-visits', opens);
  setTxt('pf-stat-sessions', sc);
  setTxt('pf-stat-time', hs.formatDuration(s.playTimeSeconds || 0));

  const avgSec = hs.avgSecondsPerEndedSession(s);
  setTxt(
    'pf-stat-avg-session',
    avgSec == null ? '—' : hs.formatDuration(avgSec),
  );

  const grid = document.getElementById('pf-achievements');
  if (grid) {
    const defs = hs.achievementDefs(s);
    grid.innerHTML = defs
      .map(
        (a) => `
      <div class="pf-achievement ${a.ok ? 'pf-achievement--got' : 'pf-achievement--locked'}" role="article">
        <span class="pf-achievement__icon" aria-hidden="true">${a.icon}</span>
        <div class="pf-achievement__meta">
          <div class="pf-achievement__title">${a.ok ? '' : '<span class="pf-lock">🔒 </span>'}${escapeHtml(a.title)}</div>
          <p class="pf-achievement__desc">${escapeHtml(a.desc)}</p>
        </div>
      </div>`,
      )
      .join('');

    const done = defs.filter((d) => d.ok).length;
    const bar = document.getElementById('pf-achievements-bar');
    if (bar)
      bar.style.width = defs.length ? Math.min(100, Math.round((done / defs.length) * 100)) + '%' : '0%';
  }

  void refreshLobbyHistory();
}

const HISTORY_GAME_NAMES = { mafia: 'Мафия', bunker: 'Бункер', alias: 'Алиас' };

function formatHistoryWhen(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function historyStatusPill(row) {
  if (row.finished_at) {
    return { text: 'Закрыто', cls: 'pf-history-pill--done' };
  }
  const st = String(row.lobby_status_last || '');
  if (st === 'active') return { text: 'Игра', cls: 'pf-history-pill--active' };
  if (st === 'waiting') return { text: 'Лобби', cls: 'pf-history-pill' };
  if (st === 'ended') return { text: 'Закрыто', cls: 'pf-history-pill--done' };
  return { text: st || '—', cls: 'pf-history-pill' };
}

async function refreshLobbyHistory() {
  const mount = document.getElementById('pf-lobby-history');
  if (!mount) return;

  const u = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
  if (!u?.id || typeof supabaseClient === 'undefined' || !supabaseClient) {
    mount.innerHTML =
      '<p class="pf-history-empty">Войди в аккаунт — список комнат появится здесь и сохранится между устройствами.</p>';
    return;
  }

  mount.innerHTML = '<div class="pf-history-loading">Загрузка…</div>';

  try {
    const { data, error } = await supabaseClient
      .from('user_lobby_history')
      .select('*')
      .eq('user_id', u.id)
      .order('last_seen_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      mount.innerHTML =
        '<p class="pf-history-empty">Пока пусто — зайди в лобби или за стол мафии под этим аккаунтом.</p>';
      return;
    }

    mount.innerHTML = rows
      .map((row) => {
        const code = escapeHtml(row.lobby_code || '—');
        const titleRaw = row.room_name && String(row.room_name).trim() ? row.room_name : row.lobby_code;
        const title = escapeHtml(titleRaw || 'Комната');
        const game = HISTORY_GAME_NAMES[row.game] || escapeHtml(row.game || 'игра');
        const st = historyStatusPill(row);
        const rolePill = row.was_host
          ? '<span class="pf-history-pill pf-history-pill--host">Хост</span>'
          : '<span class="pf-history-pill">Игрок</span>';

        return `
          <article class="pf-history-card">
            <div class="pf-history-card__title">${title}</div>
            <div class="pf-history-card__code">${code}</div>
            <div class="pf-history-card__tags">
              <span class="pf-history-pill pf-history-pill--game">${game}</span>
              ${rolePill}
              <span class="pf-history-pill ${escapeHtml(st.cls)}">${escapeHtml(st.text)}</span>
            </div>
            <div class="pf-history-card__times">
              Последний раз: ${formatHistoryWhen(row.last_seen_at)} · Первый заход: ${formatHistoryWhen(row.first_seen_at)}
              ${row.finished_at ? `<br/>Финиш: ${formatHistoryWhen(row.finished_at)}` : ''}
            </div>
          </article>`;
      })
      .join('');
  } catch (e) {
    const msg = String(e?.message || e || '');
    const code = e?.code != null ? String(e.code) : '';
    const hints = `${msg} ${code}`;
    // Не использовать имя таблицы в фильтре: в тексте ошибок RLS/прав тоже встречается user_lobby_history.
    const missingTable =
      /\b42P01\b/.test(hints) ||
      /\bdoes not exist\b/i.test(msg) ||
      /schema cache/i.test(msg) ||
      /\b(PGRST205|PGRST115)\b/i.test(hints);
    mount.innerHTML = missingTable
      ? '<p class="pf-history-error">Таблица истории ещё не создана или Supabase её не видит — выполни SQL из <code>supabase/user_lobby_history.sql</code> в том же проекте, где лежит <code>js/supabase-client.js</code>, затем подожди минуту и обнови страницу.</p>'
      : `<p class="pf-history-error">Не удалось загрузить историю: ${escapeHtml(msg)}${code ? ` <code>${escapeHtml(code)}</code>` : ''}</p>`;
  }
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function initProfileNavbar() {
  const burgerBtn = document.getElementById('burgerBtn');
  const navLinks = document.getElementById('navLinks');
  const navAuth = document.getElementById('navAuth');

  burgerBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
    navAuth?.classList.toggle('open');
  });
  document.querySelectorAll('.pf-page .nav-link').forEach((link) => {
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

document.addEventListener('DOMContentLoaded', () => {
  initProfileNavbar();
  window._onAuthUpdate = renderProfileDashboard;
  renderProfileDashboard();
});
