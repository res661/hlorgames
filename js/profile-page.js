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

const PF_TIER_LABEL = {
  common: 'Обычное',
  uncommon: 'Необычное',
  rare: 'Редкое',
  epic: 'Эпическое',
  legendary: 'Легендарное',
};

const PF_TIER_ORDER = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const PF_SORT_KEY = 'pf_achievement_sort_v1';
const PF_SORT_MODES = ['default', 'done_first', 'locked_first', 'tier_high', 'tier_low', 'progress_desc'];

const PF_LOCK_HTML =
  '<span class="pf-lock" aria-hidden="true">' +
  '<svg class="pf-lock__svg" width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>' +
  '<rect x="5" y="11" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.75"/>' +
  '</svg></span>';

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

function getAchievementSortMode() {
  try {
    const v = localStorage.getItem(PF_SORT_KEY);
    if (PF_SORT_MODES.includes(v)) return v;
  } catch (_) {}
  return 'default';
}

function setAchievementSortMode(m) {
  if (!PF_SORT_MODES.includes(m)) return;
  try {
    localStorage.setItem(PF_SORT_KEY, m);
  } catch (_) {}
}

function tierRankSafe(a) {
  return PF_TIER_ORDER[a?.tier] || 1;
}

function sortAchievementDefs(rawDefs, mode) {
  const boxed = rawDefs.map((def, idx) => ({ def, idx }));
  boxed.sort((A, B) => {
    const a = A.def;
    const b = B.def;
    if (mode === 'default') return A.idx - B.idx;

    if (mode === 'done_first') {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return A.idx - B.idx;
    }
    if (mode === 'locked_first') {
      if (a.ok !== b.ok) return a.ok ? 1 : -1;
      return A.idx - B.idx;
    }

    if (mode === 'tier_high') {
      const dr = tierRankSafe(b) - tierRankSafe(a);
      if (dr !== 0) return dr;
      return A.idx - B.idx;
    }

    if (mode === 'tier_low') {
      const dr = tierRankSafe(a) - tierRankSafe(b);
      if (dr !== 0) return dr;
      return A.idx - B.idx;
    }

    if (mode === 'progress_desc') {
      if (a.ok !== b.ok) return a.ok ? 1 : -1;
      const pa = Number(a.progress) || 0;
      const pb = Number(b.progress) || 0;
      if (pa !== pb) return pb - pa;
      return A.idx - B.idx;
    }

    return A.idx - B.idx;
  });
  return boxed.map((x) => x.def);
}

function achievementCardHtml(a) {
  const tier = a.tier && PF_TIER_LABEL[a.tier] ? a.tier : 'common';
  const tierLabel = PF_TIER_LABEL[tier] || PF_TIER_LABEL.common;
  const pct = a.ok ? 100 : Math.max(0, Math.min(100, Number(a.progress) || 0));
  const statusLabel = a.ok ? 'Получено' : 'В процессе';
  const stateClass = a.ok ? 'pf-achievement--got' : 'pf-achievement--locked';
  return `
      <div class="pf-achievement pf-achievement--tier-${tier} ${stateClass}" role="article">
        <div class="pf-achievement__icon-box" aria-hidden="true">
          <span class="pf-achievement__icon">${a.icon}</span>
        </div>
        <div class="pf-achievement__body">
          <div class="pf-achievement__headline">
            <span class="pf-achievement__tier">${escapeHtml(tierLabel)}</span>
            <h3 class="pf-achievement__title">${a.ok ? '' : PF_LOCK_HTML + ' '}${escapeHtml(a.title)}</h3>
          </div>
          <p class="pf-achievement__desc">${escapeHtml(a.desc)}</p>
          <div class="pf-achievement__foot">
            <div class="pf-achievement__progress-wrap">
              <div class="pf-achievement__progress-visual" aria-hidden="true">
                <div class="pf-achievement__progress-track">
                  <div class="pf-achievement__progress-bar" style="width:${pct}%"></div>
                </div>
              </div>
              <span class="pf-achievement__pct">${pct}%</span>
            </div>
            <span class="pf-achievement__status pf-achievement__status--${a.ok ? 'done' : 'todo'}">${escapeHtml(statusLabel)}</span>
          </div>
        </div>
      </div>`;
}

function syncAchievementSortToolbar() {
  const mode = getAchievementSortMode();
  const toolbar = document.getElementById('pf-achievements-sort');
  if (!toolbar) return;
  toolbar.querySelectorAll('[data-pf-sort]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-pf-sort') === mode);
  });
}

function bindAchievementSortOnce() {
  const toolbar = document.getElementById('pf-achievements-sort');
  if (!toolbar || toolbar.dataset.pfBound === '1') return;
  toolbar.dataset.pfBound = '1';
  toolbar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pf-sort]');
    if (!btn) return;
    const m = btn.getAttribute('data-pf-sort');
    setAchievementSortMode(m);
    syncAchievementSortToolbar();
    renderAchievementsFromLocal(window.hlorStats);
  });
}

function renderAchievementsFromLocal(hs) {
  if (!hs) return;
  const s = hs.load();
  const grid = document.getElementById('pf-achievements');
  const summaryEl = document.getElementById('pf-achievements-summary');
  bindAchievementSortOnce();
  if (!grid) return;

  const rawDefs = hs.achievementDefs(s);
  const defs = sortAchievementDefs(rawDefs, getAchievementSortMode());
  grid.innerHTML = defs.map((a) => achievementCardHtml(a)).join('');
  syncAchievementSortToolbar();

  const done = rawDefs.filter((d) => d.ok).length;
  const total = rawDefs.length;
  if (summaryEl) summaryEl.textContent = total ? `${done} из ${total} открыто` : '';

  const bar = document.getElementById('pf-achievements-bar');
  if (bar) bar.style.width = total ? Math.min(100, Math.round((done / total) * 100)) + '%' : '0%';
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

  applyPfLabels();

  const hintAvg = document.getElementById('pf-hint-avg');
  if (hintAvg) {
    hintAvg.textContent =
      '«Время за столами» ÷ «Закрыто лобби» — по текущим счётчикам ниже';
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
