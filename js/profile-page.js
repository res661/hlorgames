/**
 * profile.html — навигация и отрисовка дашборда из hlorStats
 */

function formatWinRate(stats) {
  const w = stats.wins || 0;
  const l = stats.losses || 0;
  const t = w + l;
  if (!t) return '—';
  return Math.round((w / t) * 100) + '%';
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
    emailEl.textContent = email || 'Войди, чтобы сохранять ник и аватар между устройствами';
    emailEl.style.opacity = email ? '' : '0.75';
  }

  let label = '';
  if (avatarEl) {
    if (u?.avatar?.startsWith('http')) {
      avatarEl.innerHTML = `<img src="${u.avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    } else if (u?.avatar && !u.avatar.startsWith('http')) {
      avatarEl.textContent = u.avatar;
      avatarEl.dataset.mode = 'emoji';
    } else if (u?.nickname?.[0]) {
      avatarEl.textContent = u.nickname[0].toUpperCase();
      avatarEl.dataset.mode = '';
    } else {
      avatarEl.textContent = '👋';
      avatarEl.dataset.mode = 'emoji';
    }
  }

  if (nameEl) {
    label = u?.nickname || '';
    nameEl.textContent = label ? label : 'Твоя статистика';
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

  setTxt('pf-stat-visits', s.mafiaTableOpens ?? 0);
  setTxt('pf-stat-sessions', s.sessionsCompleted ?? 0);
  setTxt('pf-stat-wins', s.wins ?? 0);
  setTxt('pf-stat-losses', s.losses ?? 0);
  setTxt('pf-stat-undecided', s.undecided ?? 0);
  setTxt('pf-stat-time', hs.formatDuration(s.playTimeSeconds || 0));
  setTxt('pf-stat-winrate', formatWinRate(s));
  setTxt('pf-stat-streak', s.winStreak ?? 0);
  setTxt('pf-stat-best-streak', s.bestWinStreak ?? 0);

  const grid = document.getElementById('pf-achievements');
  if (!grid) return;

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
