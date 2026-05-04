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

const PF_FRAME_KEY = 'pf_profile_frame_v1';

/** Рамки: по уровню (опыт) или по достижению */
const PF_FRAMES = [
  { id: 'classic', name: 'Классика', unlock: { type: 'always' } },
  { id: 'mist', name: 'Лёгкая дымка', unlock: { type: 'level', min: 2 } },
  { id: 'jade', name: 'Нефрит', unlock: { type: 'level', min: 5 } },
  { id: 'volt', name: 'Разряд', unlock: { type: 'level', min: 10 } },
  { id: 'aurora', name: 'Сияние', unlock: { type: 'level', min: 15 } },
  { id: 'ember', name: 'Тлеющий уголь', unlock: { type: 'level', min: 22 } },
  { id: 'finisher_trim', name: 'До финиша', unlock: { type: 'achievement', id: 'finisher' } },
  { id: 'duo_orbit', name: 'Две орбиты', unlock: { type: 'achievement', id: 'both_games' } },
  { id: 'veteran_trim', name: 'Боевой склад', unlock: { type: 'achievement', id: 'veteran' } },
  { id: 'sessions_elite_trim', name: 'Элита стола', unlock: { type: 'achievement', id: 'sessions_elite' } },
  { id: 'champion_halo', name: 'Чемпион', unlock: { type: 'achievement', id: 'champion' } },
  { id: 'immortal_gate', name: 'Бессмертие', unlock: { type: 'achievement', id: 'sessions_immortal' } },
  { id: 'chrono_corona', name: 'Хроно-корона', unlock: { type: 'achievement', id: 'time_ultra' } },
];

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

function pfGetFrameSelection() {
  try {
    return localStorage.getItem(PF_FRAME_KEY) || 'classic';
  } catch (_) {
    return 'classic';
  }
}

function pfSetFrameSelection(id) {
  try {
    localStorage.setItem(PF_FRAME_KEY, id);
  } catch (_) {}
}

function pfAchievementOkSet(defs) {
  const o = {};
  (defs || []).forEach((d) => {
    if (d && d.ok) o[d.id] = true;
  });
  return o;
}

function pfFrameUnlocked(fr, level, achieved) {
  const u = fr.unlock;
  if (u.type === 'always') return true;
  if (u.type === 'level') return level >= Number(u.min) || 0;
  if (u.type === 'achievement') return !!achieved[u.id];
  return false;
}

function pfNormalizeFrameSelection(sel, unlockedMap) {
  const s = String(sel || '').trim();
  if (s && unlockedMap[s]) return s;
  return unlockedMap.classic ? 'classic' : PF_FRAMES[0].id;
}

function pfFrameHintText(fr, titleById, level, achieved) {
  const u = fr.unlock;
  if (u.type === 'always') return 'Всегда доступна';
  if (u.type === 'level') {
    const m = Number(u.min) || 1;
    if (level >= m) return `Уровень ${m}+ · открыто`;
    return `Нужен ${m}+ уровень · сейчас ${level}`;
  }
  if (u.type === 'achievement') {
    const nm = titleById[u.id] || u.id;
    return achieved[u.id] ? `Достижение «${nm}»` : `Открой: «${nm}»`;
  }
  return '';
}

function pfApplyAvatarFrameClass(frameId) {
  const wrap = document.getElementById('pf-avatar-wrap');
  if (!wrap) return;
  PF_FRAMES.forEach((f) => wrap.classList.remove(`pf-avatar-wrap--frame-${f.id}`));
  const id = PF_FRAMES.some((f) => f.id === frameId) ? frameId : 'classic';
  wrap.classList.add(`pf-avatar-wrap--frame-${id}`);
}

function pfFrameCardHtml(fr, unlocked, selected, hint) {
  const lockSvg =
    unlocked || fr.unlock?.type === 'always'
      ? ''
      : '<span class="pf-frame-card__lock" aria-hidden="true">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M8 11V8a4 4 0 118 0v3"/><rect x="5" y="11" width="14" height="11" rx="2"/></svg></span>';

  return (
    `<button type="button" role="listitem" class="pf-frame-card` +
    (unlocked ? '' : ' pf-frame-card--locked') +
    (selected ? ' pf-frame-card--selected' : '') +
    `" data-pf-frame="${escapeHtml(fr.id)}">` +
    `<span class="pf-frame-card__mock" aria-hidden="true">` +
    `<span class="pf-mini-wrap pf-avatar-wrap pf-avatar-wrap--frame-${fr.id} pf-avatar-wrap--mini">` +
    `<span class="pf-mini-core"></span></span>${lockSvg}</span>` +
    `<span class="pf-frame-card__body">` +
    `<span class="pf-frame-card__name">${escapeHtml(fr.name)}</span>` +
    `<span class="pf-frame-card__hint">${escapeHtml(hint)}</span>` +
    `</span></button>`
  );
}

function bindPfFramesOnce() {
  const grid = document.getElementById('pf-frames-grid');
  if (!grid || grid.dataset.pfBound === '1') return;
  grid.dataset.pfBound = '1';
  grid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pf-frame]');
    if (!btn) return;
    const id = btn.getAttribute('data-pf-frame');
    const hs = window.hlorStats;
    if (!id || !hs || typeof hs.computeProfileGamification !== 'function') return;
    const s = hs.load();
    const G = hs.computeProfileGamification(s);
    const achieved = pfAchievementOkSet(G.defs);
    const unlocked = {};
    PF_FRAMES.forEach((fr) => {
      unlocked[fr.id] = pfFrameUnlocked(fr, G.level, achieved);
    });
    if (!unlocked[id]) {
      if (typeof showToast === 'function') showToast('Эта рамка ещё закрыта', 'error');
      return;
    }
    pfSetFrameSelection(id);
    pfApplyAvatarFrameClass(id);
    void renderProfileDashboard();
  });
}

function renderLevelAndFrames(hs) {
  bindPfFramesOnce();
  if (!hs || typeof hs.computeProfileGamification !== 'function') return;
  const s = hs.load();
  const G = hs.computeProfileGamification(s);
  const titleById = {};
  G.defs.forEach((d) => {
    titleById[d.id] = d.title;
  });
  const achieved = pfAchievementOkSet(G.defs);
  const unlocked = {};
  PF_FRAMES.forEach((fr) => {
    unlocked[fr.id] = pfFrameUnlocked(fr, G.level, achieved);
  });

  const prevSel = pfGetFrameSelection();
  const sel = pfNormalizeFrameSelection(prevSel, unlocked);
  if (sel !== prevSel) pfSetFrameSelection(sel);
  pfApplyAvatarFrameClass(sel);

  const lvlChip = document.getElementById('pf-level-num');
  const lvlDup = document.getElementById('pf-xp-level-dup');
  if (lvlChip) lvlChip.textContent = String(G.level);
  if (lvlDup) lvlDup.textContent = String(G.level);

  const need = Math.max(1, G.xpForNextLevel || 1);
  const pct = Math.min(100, Math.round((Math.max(0, G.xpIntoLevel) / need) * 100));
  const bar = document.getElementById('pf-xp-bar-fill');
  if (bar) bar.style.width = `${pct}%`;

  const left = Math.max(0, need - Math.max(0, G.xpIntoLevel));
  const sumEl = document.getElementById('pf-xp-summary');
  if (sumEl) {
    sumEl.textContent = `${(G.xpTotal || 0).toLocaleString('ru-RU')} XP · до уровня ${
      G.level + 1
    }: ещё ${left.toLocaleString('ru-RU')} XP`;
  }

  const grid = document.getElementById('pf-frames-grid');
  if (grid) {
    grid.innerHTML = PF_FRAMES.map((fr) =>
      pfFrameCardHtml(fr, unlocked[fr.id], sel === fr.id, pfFrameHintText(fr, titleById, G.level, achieved)),
    ).join('');
  }
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
  renderLevelAndFrames(hs);
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
