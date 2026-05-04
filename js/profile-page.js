/**
 * profile.html — навигация, дашборд: те же счётчики, что в hlorStats (профиль), синхронизируются в аккаунт для топа.
 */

const PF_LABELS = {
  mafia: 'Мафия — заход за стол',
  whoami: 'Кто я? — заход в комнату',
  sessions: 'Закрыто лобби (хост закончил)',
  time: 'Время за столами',
  avg: 'Среднее время на одно закрытое лобби',
};

function applyPfLabels() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('pf-label-mafia', PF_LABELS.mafia);
  set('pf-label-whoami', PF_LABELS.whoami);
  set('pf-label-sessions', PF_LABELS.sessions);
  set('pf-label-time', PF_LABELS.time);
  set('pf-label-avg', PF_LABELS.avg);
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

  applyPfLabels();

  if (explainer) {
    explainer.textContent = u
      ? 'Счётчики совпадают с топом: они же записываются в профиль на сервере. Общая таблица топа обновляется при пересборке на сервере (leaderboard_refresh_stats).'
      : 'Без входа считаем только этот браузер. После входа те же числа отправляются в аккаунт и попадают в топ после пересборки.';
  }

  const hintAvg = document.getElementById('pf-hint-avg');
  if (hintAvg) {
    hintAvg.textContent =
      '«Время за столами» ÷ «Закрыто лобби» — по текущим счётчикам ниже';
  }

  if (banner) {
    banner.textContent = u
      ? 'Вошёл в аккаунт — счётчики синхронизируются с сервером для топа; если на странице топа ещё старые цифры, нужна пересборка leaderboard_refresh_stats.'
      : 'Без входа счёт только локально; после входа игры добавляют статистику в профиль и в топ (после пересборки на сервере).';
    banner.classList.remove('hidden');
  }

  renderLocalStatNumbers(hs);
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
