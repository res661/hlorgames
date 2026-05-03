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

  const opensMafia = s.mafiaTableOpens ?? 0;
  const opensWhoami = s.whoamiTableOpens ?? 0;
  const sc = s.sessionsCompleted ?? 0;
  setTxt('pf-stat-mafia-opens', opensMafia);
  setTxt('pf-stat-whoami-opens', opensWhoami);
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
