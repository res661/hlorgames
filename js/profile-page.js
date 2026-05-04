/**
 * profile.html — навигация, дашборд: для залогиненных те же цифры, что в топе (leaderboard_public).
 */

const PF_LABELS_SERVER = {
  mafia: 'Мафия — завершённые лобби',
  whoami: 'Кто я? — завершённые лобби',
  sessions: 'Всего закрытых лобби',
  time: 'Время в комнатах (оценка)',
  avg: 'Среднее время на одно закрытое лобби',
};

const PF_LABELS_LOCAL = {
  mafia: 'Мафия — заход за стол',
  whoami: 'Кто я? — заход в комнату',
  sessions: 'Закрыто лобби (в браузере)',
  time: 'Время за столами (браузер)',
  avg: 'Среднее время на закрытую партию (браузер)',
};

function applyPfLabels(which) {
  const L = which === 'server' ? PF_LABELS_SERVER : PF_LABELS_LOCAL;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('pf-label-mafia', L.mafia);
  set('pf-label-whoami', L.whoami);
  set('pf-label-sessions', L.sessions);
  set('pf-label-time', L.time);
  set('pf-label-avg', L.avg);
}

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

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

async function fetchMyLeaderboardPublicRow(userId) {
  if (!window.supabaseClient || !userId) return null;
  try {
    const { data, error } = await supabaseClient
      .from('leaderboard_public')
      .select('games_mafia,games_whoami,games_other,completed_total,visits_total,play_seconds_estimate')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (_) {
    return null;
  }
}

function renderAchievementsFromLocal(hs) {
  if (!hs) return;
  const s = hs.load();
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
}

function renderLocalStatNumbers(hs) {
  if (!hs) return;
  const s = hs.load();
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null ? String(val) : '—';
  };

  setTxt('pf-stat-mafia-opens', s.mafiaTableOpens ?? 0);
  setTxt('pf-stat-whoami-opens', s.whoamiTableOpens ?? 0);
  setTxt('pf-stat-sessions', s.sessionsCompleted ?? 0);
  setTxt('pf-stat-time', hs.formatDuration(s.playTimeSeconds || 0));

  const avgSec = hs.avgSecondsPerEndedSession(s);
  setTxt('pf-stat-avg-session', avgSec == null ? '—' : hs.formatDuration(avgSec));
}

async function renderProfileDashboard() {
  renderProfileHero();

  const hs = window.hlorStats;
  const banner = document.getElementById('pf-stats-source-banner');
  const explainer = document.getElementById('pf-stats-explainer');

  const u = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;

  if (explainer) {
    explainer.textContent = u
      ? 'Цифры ниже для аккаунта совпадают со страницей топа: только завершённые лобби (хост закрыл комнату). Общий топ на сервере пересчитывается командой пересборки или по расписанию.'
      : 'Без входа считаем только этот браузер: заходы за стол и время по вкладке игры. После входа показываем те же завершённые лобби, что и в топе.';
  }

  if (!u || !window.supabaseClient) {
    applyPfLabels('local');
    const hintAvgGuest = document.getElementById('pf-hint-avg');
    if (hintAvgGuest)
      hintAvgGuest.textContent = '«Время за столами» ÷ «Закрыто лобби» — только этот браузер';
    banner?.classList.add('hidden');
    renderLocalStatNumbers(hs);
    renderAchievementsFromLocal(hs);
    return;
  }

  let row = await fetchMyLeaderboardPublicRow(u.id);
  if (!row && document.readyState === 'complete') {
    await new Promise((r) => setTimeout(r, 350));
    row = await fetchMyLeaderboardPublicRow(u.id);
  }

  if (row) {
    applyPfLabels('server');
    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val != null ? String(val) : '—';
    };

    const gm = Number(row.games_mafia) || 0;
    const gw = Number(row.games_whoami) || 0;
    const ct = Number(row.completed_total) || 0;
    const pt = Number(row.play_seconds_estimate) || 0;

    setTxt('pf-stat-mafia-opens', gm);
    setTxt('pf-stat-whoami-opens', gw);
    setTxt('pf-stat-sessions', ct);
    setTxt('pf-stat-time', hs ? hs.formatDuration(pt) : String(pt));

    const avgSec = ct > 0 ? Math.round(pt / ct) : null;
    setTxt('pf-stat-avg-session', avgSec == null ? '—' : hs.formatDuration(avgSec));

    const hintAvg = document.getElementById('pf-hint-avg');
    if (hintAvg) hintAvg.textContent = 'Время ÷ число закрытых лобби (как на странице топа)';

    if (banner) {
      banner.textContent =
        'Источник: сервер (таблица топа). Если закрыл лобби, а нули — подожди пересборку топа на сервере.';
      banner.classList.remove('hidden');
    }
  } else {
    applyPfLabels('local');
    renderLocalStatNumbers(hs);
    const hintAvg = document.getElementById('pf-hint-avg');
    if (hintAvg) hintAvg.textContent = '«Время за столами» ÷ «Закрыто лобби» — только этот браузер';

    if (banner) {
      banner.textContent =
        'Строки топа на сервере для тебя пока нет — после игр до закрытия лобби хостом и пересборки топа цифры совпадут с топом. Ниже пока счёт из браузера.';
      banner.classList.remove('hidden');
    }
  }

  renderAchievementsFromLocal(hs);
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
  window._onAuthUpdate = function () {
    void renderProfileDashboard();
  };
  void renderProfileDashboard();
});
