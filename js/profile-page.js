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
const PF_PLAQUE_KEY = 'pf_profile_plaque_v1';

/**
 * Плашка — фон карточки героя профиля. Редкость для коллекции (как у бейджей).
 * unlock: always | level | achievement (id из achievementDefs)
 */
const PF_PLAQUES = [
  { id: 'studio_default', name: 'Студийная', tier: 'common', unlock: { type: 'always' } },
  { id: 'lime_mist', name: 'Лаймовая дымка', tier: 'common', unlock: { type: 'level', min: 3 } },
  { id: 'slate_signal', name: 'Сигнал сланца', tier: 'uncommon', unlock: { type: 'level', min: 8 } },
  { id: 'ember_hall', name: 'Зал углей', tier: 'uncommon', unlock: { type: 'level', min: 14 } },
  { id: 'duo_neon', name: 'Две игры — неон', tier: 'uncommon', unlock: { type: 'achievement', id: 'both_games' } },
  { id: 'mafia_den', name: 'Логово мафии', tier: 'rare', unlock: { type: 'achievement', id: 'mafia_fan' } },
  { id: 'riddle_mist', name: 'Туман загадок', tier: 'rare', unlock: { type: 'achievement', id: 'whoami_fan' } },
  { id: 'summit_gold', name: 'Золотая вершина', tier: 'epic', unlock: { type: 'achievement', id: 'champion' } },
  { id: 'elite_floor', name: 'Элитный зал', tier: 'epic', unlock: { type: 'achievement', id: 'sessions_elite' } },
  { id: 'immortal_hall', name: 'Зал бессмертия', tier: 'epic', unlock: { type: 'achievement', id: 'sessions_immortal' } },
  { id: 'chrono_abyss', name: 'Бездна хроноса', tier: 'legendary', unlock: { type: 'achievement', id: 'time_ultra' } },
];

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
  { id: 'silver_lane', name: 'Серебряная дорожка', unlock: { type: 'level', min: 4 } },
  { id: 'rose_glass', name: 'Розовое стекло', unlock: { type: 'level', min: 7 } },
  { id: 'ocean_pulse', name: 'Океанский пульс', unlock: { type: 'level', min: 12 } },
  { id: 'void_prism', name: 'Призма бездны', unlock: { type: 'level', min: 18 } },
  { id: 'nova_ring', name: 'Нова', unlock: { type: 'level', min: 28 } },
  { id: 'celestial', name: 'Небесная', unlock: { type: 'level', min: 35 } },
  { id: 'welcome_trim', name: 'Первый шаг', unlock: { type: 'achievement', id: 'first_visit' } },
  { id: 'hearth_trim', name: 'Свой зал', unlock: { type: 'achievement', id: 'table_regular' } },
  { id: 'mafia_sigil', name: 'Сигил мафии', unlock: { type: 'achievement', id: 'mafia_fan' } },
  { id: 'mirror_trim', name: 'Зеркало слов', unlock: { type: 'achievement', id: 'whoami_fan' } },
  { id: 'fivefold_seal', name: 'Печать пяти', unlock: { type: 'achievement', id: 'committed' } },
  { id: 'stripe_command', name: 'Штурман стола', unlock: { type: 'achievement', id: 'soldier' } },
  { id: 'sunset_hour', name: 'Золотой час', unlock: { type: 'achievement', id: 'time_sink' } },
  { id: 'cobble_trim', name: '25 ступеней', unlock: { type: 'achievement', id: 'table_25' } },
  { id: 'marble_gate', name: 'Сто столов', unlock: { type: 'achievement', id: 'table_100' } },
  { id: 'mid_lane', name: 'Середина пути', unlock: { type: 'achievement', id: 'sessions_mid' } },
  { id: 'night_sovereign', name: 'Покровитель ночи', unlock: { type: 'achievement', id: 'mafia_triple' } },
  { id: 'riddle_crown', name: 'Корона загадок', unlock: { type: 'achievement', id: 'whoami_triple' } },
  { id: 'dual_balance', name: 'Двойной резонанс', unlock: { type: 'achievement', id: 'both_packed' } },
  { id: 'steel_resolve', name: 'Сталь решений', unlock: { type: 'achievement', id: 'sessions_strong' } },
  { id: 'titan_forge', name: 'Кузня титана', unlock: { type: 'achievement', id: 'sessions_titan' } },
];

const PF_BADGE_KEY = 'pf_equipped_badges_v1';
const PF_BADGE_MAX = 4;

/** Бейджи у ника: редкость + условие (уровень / достижение / время за столом) */
const PF_BADGES = [
  { id: 'hlor_core', label: 'HLOR', tier: 'common', unlock: { type: 'always' } },
  { id: 'hour_stint', label: '1ч+', tier: 'common', unlock: { type: 'time', seconds: 3600 } },
  { id: 'regular_table', label: 'Знатный гость', tier: 'uncommon', unlock: { type: 'achievement', id: 'table_regular' } },
  { id: 'finisher_b', label: 'Финиш', tier: 'uncommon', unlock: { type: 'achievement', id: 'finisher' } },
  { id: 'committed_b', label: 'В деле×5', tier: 'uncommon', unlock: { type: 'achievement', id: 'committed' } },
  { id: 'lvl_8', label: '8 ур.', tier: 'uncommon', unlock: { type: 'level', min: 8 } },
  { id: 'mafia_stage', label: 'Мафия+', tier: 'rare', unlock: { type: 'achievement', id: 'mafia_double' } },
  { id: 'whoami_stage', label: 'Кто я?+', tier: 'rare', unlock: { type: 'achievement', id: 'whoami_double' } },
  { id: 'duo_path', label: 'Две игры', tier: 'rare', unlock: { type: 'achievement', id: 'both_games' } },
  { id: 'night_shift_b', label: 'Ночник', tier: 'rare', unlock: { type: 'achievement', id: 'night_shift' } },
  { id: 'marathon_b', label: 'Марафон', tier: 'epic', unlock: { type: 'achievement', id: 'marathon' } },
  { id: 'veteran_b', label: 'Ветеран', tier: 'epic', unlock: { type: 'achievement', id: 'veteran' } },
  { id: 'champion_b', label: 'Чемпион', tier: 'epic', unlock: { type: 'achievement', id: 'champion' } },
  { id: 'lvl_16', label: '16 ур.', tier: 'rare', unlock: { type: 'level', min: 16 } },
  { id: 'lvl_25', label: '25 ур.', tier: 'epic', unlock: { type: 'level', min: 25 } },
  { id: 'legend_b', label: 'Легенда', tier: 'legendary', unlock: { type: 'achievement', id: 'legend_sessions' } },
  { id: 'immortal_b', label: 'Бессмерт.', tier: 'legendary', unlock: { type: 'achievement', id: 'sessions_immortal' } },
  { id: 'chrono_b', label: 'Ультра-часы', tier: 'legendary', unlock: { type: 'achievement', id: 'time_ultra' } },
];

/** Уникальные stroke-иконки бейджей (viewBox 24×24); текст только в подсказках */
const PF_BADGE_ICONS = {
  _default: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>',
  hlor_core:
    '<path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6L12 2z"/>',
  hour_stint: '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l4 2"/>',
  regular_table:
    '<circle cx="9" cy="8.5" r="2.8"/><circle cx="17" cy="8.5" r="2.8"/><path d="M3 21a9 9 0 018-5 9 9 0 018 5"/>',
  finisher_b: '<path d="M20 7L10 17l-5-5"/>',
  committed_b:
    '<path d="M12 3l9.5 6L12 12 2.5 9 12 3z"/><path d="M2.5 14l9.5 4 9.5-4"/>',
  lvl_8: '<polygon points="12,3 17,8 21,13 17,18 12,21 7,18 3,13 7,8"/>',
  mafia_stage:
    '<ellipse cx="12" cy="12.5" rx="8.2" ry="5.8"/><circle cx="9.2" cy="12.8" r="1.35" fill="currentColor" stroke="none"/><circle cx="14.8" cy="12.8" r="1.35" fill="currentColor" stroke="none"/><path d="M9 16h6"/>',
  whoami_stage:
    '<circle cx="12" cy="12" r="10"/><path d="M12 17h.01"/><path d="M10.5 10a3.5 3.5 0 116.2 2.2"/>',
  duo_path:
    '<circle cx="8" cy="12" r="3.75"/><circle cx="16" cy="12" r="3.75"/><path d="M11.5 12h1"/>',
  night_shift_b: '<path d="M21 12.8a9 9 0 11-10-10 7 7 0 0010 10z"/>',
  marathon_b:
    '<path d="M13 2L3 14h9l-1 8 11-13h-9l9-11z"/>',
  veteran_b:
    '<path d="M12 22s8-4 8-10V8l-8-5-8 5v4c0 6 8 10 8 10z"/><path d="M12 8v13"/>',
  champion_b:
    '<path d="M6 21h12"/><path d="M9 17V9h6v8"/><path d="M9 9V7a3 3 0 016 0v2"/><path d="M7 13h10"/>',
  lvl_16: '<circle cx="12" cy="10" r="5.5"/><path d="M8 21h8"/><path d="M12 15.5v5.5"/>',
  lvl_25:
    '<path d="M4 20h16"/><path d="M5 20l3-12 4 8 4-8 3 12"/><path d="M6 16h12"/>',
  legend_b:
    '<polygon points="12 2 15 10.5 23 12.5 17 17 18.5 23 12 19.5 5.5 23 7 17 1 12.5 9 10.5"/>',
  immortal_b:
    '<path d="M8 21h8"/><path d="M12 21v3"/><ellipse cx="12" cy="10" rx="7" ry="8"/><circle cx="9" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="9" r="1.4" fill="currentColor"/><path d="M9 14s1.8 4 6 4"/>',
  chrono_b:
    '<path d="M6 5h12"/><path d="M6 19h12"/><path d="M8 12h8"/><path d="M14 13l4 4"/><path d="M8 13l-2 6"/><path d="M18 13l2 6"/>',
};

function pfBadgeIconInner(badgeId) {
  const raw = PF_BADGE_ICONS[badgeId];
  const inner = raw || PF_BADGE_ICONS._default;
  return inner;
}

function pfBadgeIconSvgWrap(badgeId, sizeClass = '') {
  const inner = pfBadgeIconInner(badgeId);
  const cls = sizeClass ? ` class="${sizeClass}"` : '';
  return (
    '<svg' +
    cls +
    ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    inner +
    '</svg>'
  );
}

function pfBadgeIconBox(badgeId, boxClass = 'pf-badge-ico-wrap') {
  return `<span class="${boxClass}">${pfBadgeIconSvgWrap(badgeId, 'pf-badge-ico-svg')}</span>`;
}

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

function pfGetPlaqueSelection() {
  try {
    return localStorage.getItem(PF_PLAQUE_KEY) || 'studio_default';
  } catch (_) {
    return 'studio_default';
  }
}

function pfSetPlaqueSelection(id) {
  try {
    localStorage.setItem(PF_PLAQUE_KEY, id);
  } catch (_) {}
}

function pfAchievementOkSet(defs) {
  const o = {};
  (defs || []).forEach((d) => {
    if (d && d.ok) o[d.id] = true;
  });
  return o;
}

/** Суперадмин видит и может надеть любые рамки, плашки и бейджи (локальный превью-коллектор). */
function pfIsCosmeticsUnlockAll() {
  return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'superadmin';
}

function pfUnlockMatches(unlock, level, achieved) {
  if (pfIsCosmeticsUnlockAll()) return true;
  const u = unlock;
  if (!u) return false;
  if (u.type === 'always') return true;
  if (u.type === 'level') return level >= (Number(u.min) || 0);
  if (u.type === 'achievement') return !!achieved[u.id];
  return false;
}

function pfFrameUnlocked(fr, level, achieved) {
  return pfUnlockMatches(fr.unlock, level, achieved);
}

function pfPlaqueUnlocked(pl, level, achieved) {
  return pfUnlockMatches(pl.unlock, level, achieved);
}

function pfNormalizeFrameSelection(sel, unlockedMap) {
  const s = String(sel || '').trim();
  if (s && unlockedMap[s]) return s;
  return unlockedMap.classic ? 'classic' : PF_FRAMES[0].id;
}

function pfNormalizePlaqueSelection(sel, unlockedMap) {
  const s = String(sel || '').trim();
  if (s && unlockedMap[s]) return s;
  return unlockedMap.studio_default ? 'studio_default' : PF_PLAQUES[0].id;
}

function pfPlaqueHintText(pl, titleById, level, achieved) {
  if (pfIsCosmeticsUnlockAll() && pl.unlock?.type !== 'always') {
    return 'Все плашки открыты (суперадмин)';
  }
  const u = pl.unlock;
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

function pfApplyPlaqueClass(plaqueId) {
  const hero = document.getElementById('pf-profile-hero');
  if (!hero) return;
  PF_PLAQUES.forEach((p) => hero.classList.remove(`pf-hero--plaque-${p.id}`));
  const id = PF_PLAQUES.some((p) => p.id === plaqueId) ? plaqueId : 'studio_default';
  if (id !== 'studio_default') {
    hero.classList.add(`pf-hero--plaque-${id}`);
  }
}

function pfPlaqueCardHtml(pl, unlocked, selected, hint) {
  const tier = pl.tier && PF_TIER_LABEL[pl.tier] ? pl.tier : 'common';
  const tierRu = PF_TIER_LABEL[tier] || 'Обычное';
  const lockSvg =
    unlocked || pl.unlock?.type === 'always'
      ? ''
      : '<span class="pf-plaque-card__lock" aria-hidden="true">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M8 11V8a4 4 0 118 0v3"/><rect x="5" y="11" width="14" height="11" rx="2"/></svg></span>';

  const previewClass =
    pl.id === 'studio_default'
      ? 'pf-plaque-preview pf-plaque-preview--default'
      : `pf-plaque-preview pf-hero--plaque-${pl.id}`;

  return (
    `<button type="button" role="listitem" class="pf-plaque-card pf-plaque-card--tier-${tier}` +
    (unlocked ? '' : ' pf-plaque-card--locked') +
    (selected ? ' pf-plaque-card--selected' : '') +
    `" data-pf-plaque="${escapeHtml(pl.id)}">` +
    `<span class="pf-plaque-card__mock" aria-hidden="true">` +
    `<span class="${previewClass}"></span>${lockSvg}</span>` +
    `<span class="pf-plaque-card__body">` +
    `<span class="pf-plaque-card__name">${escapeHtml(pl.name)}</span>` +
    `<span class="pf-plaque-card__tier">${escapeHtml(tierRu)}</span>` +
    `<span class="pf-plaque-card__hint">${escapeHtml(hint)}</span>` +
    `</span></button>`
  );
}

function pfFrameHintText(fr, titleById, level, achieved) {
  if (pfIsCosmeticsUnlockAll() && fr.unlock?.type !== 'always') {
    return 'Все рамки открыты (суперадмин)';
  }
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

function bindPfPlaquesOnce() {
  const grid = document.getElementById('pf-plaques-grid');
  if (!grid || grid.dataset.pfPlaqueBound === '1') return;
  grid.dataset.pfPlaqueBound = '1';
  grid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pf-plaque]');
    if (!btn) return;
    const id = btn.getAttribute('data-pf-plaque');
    const hs = window.hlorStats;
    if (!id || !hs || typeof hs.computeProfileGamification !== 'function') return;
    const s = hs.load();
    const G = hs.computeProfileGamification(s);
    const achieved = pfAchievementOkSet(G.defs);
    const unlocked = {};
    PF_PLAQUES.forEach((pl) => {
      unlocked[pl.id] = pfPlaqueUnlocked(pl, G.level, achieved);
    });
    if (!unlocked[id]) {
      if (typeof showToast === 'function') showToast('Эта плашка ещё закрыта', 'error');
      return;
    }
    pfSetPlaqueSelection(id);
    pfApplyPlaqueClass(id);
    void renderProfileDashboard();
  });
}

function renderLevelAndFrames(hs) {
  bindPfFramesOnce();
  bindPfPlaquesOnce();
  if (!hs || typeof hs.computeProfileGamification !== 'function') {
    pfApplyPlaqueClass(pfGetPlaqueSelection());
    pfApplyAvatarFrameClass(pfGetFrameSelection());
    return;
  }
  const s = hs.load();
  const G = hs.computeProfileGamification(s);
  const titleById = {};
  G.defs.forEach((d) => {
    titleById[d.id] = d.title;
  });
  const achieved = pfAchievementOkSet(G.defs);
  const unlockedFrames = {};
  PF_FRAMES.forEach((fr) => {
    unlockedFrames[fr.id] = pfFrameUnlocked(fr, G.level, achieved);
  });

  const unlockedPlaques = {};
  PF_PLAQUES.forEach((pl) => {
    unlockedPlaques[pl.id] = pfPlaqueUnlocked(pl, G.level, achieved);
  });

  const prevPlaque = pfGetPlaqueSelection();
  const selPlaque = pfNormalizePlaqueSelection(prevPlaque, unlockedPlaques);
  if (selPlaque !== prevPlaque) pfSetPlaqueSelection(selPlaque);
  pfApplyPlaqueClass(selPlaque);

  const prevSel = pfGetFrameSelection();
  const sel = pfNormalizeFrameSelection(prevSel, unlockedFrames);
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

  const plaquesGrid = document.getElementById('pf-plaques-grid');
  if (plaquesGrid) {
    plaquesGrid.innerHTML = PF_PLAQUES.map((pl) =>
      pfPlaqueCardHtml(
        pl,
        unlockedPlaques[pl.id],
        selPlaque === pl.id,
        pfPlaqueHintText(pl, titleById, G.level, achieved),
      ),
    ).join('');
  }

  const grid = document.getElementById('pf-frames-grid');
  if (grid) {
    grid.innerHTML = PF_FRAMES.map((fr) =>
      pfFrameCardHtml(
        fr,
        unlockedFrames[fr.id],
        sel === fr.id,
        pfFrameHintText(fr, titleById, G.level, achieved),
      ),
    ).join('');
  }
}

function pfGetEquippedBadges() {
  try {
    const raw = localStorage.getItem(PF_BADGE_KEY);
    const a = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(a)) return [];
    return [...new Set(a.map((x) => String(x).trim()).filter(Boolean))].slice(0, PF_BADGE_MAX);
  } catch (_) {
    return [];
  }
}

function pfSetEquippedBadges(ids) {
  try {
    const clean = [...new Set((ids || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, PF_BADGE_MAX);
    localStorage.setItem(PF_BADGE_KEY, JSON.stringify(clean));
  } catch (_) {}
}

function pfBadgeUnlocked(b, level, achieved, stats) {
  if (pfIsCosmeticsUnlockAll()) return true;
  const u = b.unlock;
  if (u.type === 'always') return true;
  if (u.type === 'level') return level >= (Number(u.min) || 0);
  if (u.type === 'achievement') return !!achieved[u.id];
  if (u.type === 'time') return (Number(stats.playTimeSeconds) || 0) >= (Number(u.seconds) || 0);
  return false;
}

function pfBadgeHintText(b, titleById, level, achieved, stats, hs) {
  if (pfIsCosmeticsUnlockAll() && b.unlock?.type !== 'always') {
    return 'Все бейджи открыты (суперадмин)';
  }
  const u = b.unlock;
  if (u.type === 'always') return 'Всегда в коллекции';
  if (u.type === 'level') {
    const m = Number(u.min) || 1;
    return level >= m ? `Уровень ${m}+ · открыто` : `Нужен уровень ${m}+ · сейчас ${level}`;
  }
  if (u.type === 'achievement') {
    const nm = titleById[u.id] || u.id;
    return achieved[u.id] ? `Достижение «${nm}»` : `Открой: «${nm}»`;
  }
  if (u.type === 'time') {
    const need = Number(u.seconds) || 0;
    const have = Number(stats.playTimeSeconds) || 0;
    if (have >= need) return `${hs.formatDuration(need)} за столом · открыто`;
    return `Ещё ~${hs.formatDuration(Math.max(0, need - have))} с активной вкладкой`;
  }
  return '';
}

function pfHeroBadgeChipHtml(b) {
  const tier = b.tier && PF_TIER_LABEL[b.tier] ? b.tier : 'common';
  const tip = `${b.label} · ${PF_TIER_LABEL[tier] || ''}`;
  return (
    `<span class="pf-chip-badge pf-chip-badge--icon pf-chip-badge--tier-${tier}" title="${escapeHtml(
      tip,
    )}" aria-label="${escapeHtml(tip)}">` +
    pfBadgeIconBox(b.id, 'pf-badge-ico-wrap pf-chip-badge__ico') +
    '</span>'
  );
}

function pfBadgeCardHtml(b, unlocked, equipped, hint) {
  const tier = b.tier && PF_TIER_LABEL[b.tier] ? b.tier : 'common';
  const tierRu = PF_TIER_LABEL[tier] || 'Обычное';
  const on = equipped.includes(b.id);
  const lock =
    unlocked || b.unlock?.type === 'always'
      ? ''
      : '<span class="pf-badge-card__lock" aria-hidden="true">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M8 11V8a4 4 0 118 0v3"/><rect x="5" y="11" width="14" height="11" rx="2"/></svg></span>';
  const tag = on ? '<span class="pf-badge-card__tag">На профиле</span>' : '';

  return (
    `<button type="button" role="listitem" class="pf-badge-card pf-badge-card--tier-${tier}` +
    (unlocked ? '' : ' pf-badge-card--locked') +
    (on ? ' pf-badge-card--equipped' : '') +
    `" data-pf-badge="${escapeHtml(b.id)}" aria-label="${escapeHtml(`${b.label}. ${tierRu}`)}">` +
    `<span class="pf-badge-card__top">` +
    `<span class="pf-chip-badge pf-chip-badge--icon pf-chip-badge--tier-${tier} pf-badge-card__chip">` +
    pfBadgeIconBox(b.id, 'pf-badge-ico-wrap pf-badge-card__ico') +
    `</span>` +
    `<span class="pf-badge-card__rarity">${escapeHtml(tierRu)}</span></span>${lock}${tag}` +
    `<span class="pf-badge-card__hint">${escapeHtml(hint)}</span></button>`
  );
}

function bindPfBadgesOnce() {
  const grid = document.getElementById('pf-badges-grid');
  if (!grid || grid.dataset.pfBound === '1') return;
  grid.dataset.pfBound = '1';
  grid.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pf-badge]');
    if (!btn) return;
    const id = btn.getAttribute('data-pf-badge');
    const hs = window.hlorStats;
    if (!id || !hs || typeof hs.computeProfileGamification !== 'function') return;
    const s = hs.load();
    const G = hs.computeProfileGamification(s);
    const achieved = pfAchievementOkSet(G.defs);
    const unlocked = {};
    PF_BADGES.forEach((b) => {
      unlocked[b.id] = pfBadgeUnlocked(b, G.level, achieved, s);
    });
    if (!unlocked[id]) {
      if (typeof showToast === 'function') showToast('Бейдж ещё закрыт', 'error');
      return;
    }
    let equipped = [...pfGetEquippedBadges()];
    if (equipped.includes(id)) equipped = equipped.filter((x) => x !== id);
    else {
      if (equipped.length >= PF_BADGE_MAX) {
        if (typeof showToast === 'function') {
          showToast(`Максимум ${PF_BADGE_MAX} бейджа — сними один (клик по «На профиле»)`, 'error');
        }
        return;
      }
      equipped.push(id);
    }
    pfSetEquippedBadges(equipped.filter((bid) => unlocked[bid]));
    void renderProfileDashboard();
  });
}

function renderBadgesSection(hs) {
  bindPfBadgesOnce();
  const heroStrip = document.getElementById('pf-hero-badges');
  const capEl = document.getElementById('pf-badges-cap');
  const grid = document.getElementById('pf-badges-grid');
  if (!hs || typeof hs.computeProfileGamification !== 'function') {
    if (heroStrip) heroStrip.innerHTML = '';
    return;
  }

  const s = hs.load();
  const G = hs.computeProfileGamification(s);
  const titleById = {};
  G.defs.forEach((d) => {
    titleById[d.id] = d.title;
  });
  const achieved = pfAchievementOkSet(G.defs);
  const unlocked = {};
  const byId = {};
  PF_BADGES.forEach((b) => {
    unlocked[b.id] = pfBadgeUnlocked(b, G.level, achieved, s);
    byId[b.id] = b;
  });

  let equipped = pfGetEquippedBadges();
  const cleaned = equipped.filter((id) => unlocked[id] && byId[id]).slice(0, PF_BADGE_MAX);
  if (cleaned.join('|') !== equipped.join('|')) pfSetEquippedBadges(cleaned);
  equipped = cleaned;

  if (heroStrip) {
    heroStrip.innerHTML = equipped.length
      ? equipped
          .map((id) => {
            const b = byId[id];
            return b ? pfHeroBadgeChipHtml(b) : '';
          })
          .join('')
      : '';
  }

  if (capEl) {
    capEl.textContent = pfIsCosmeticsUnlockAll()
      ? `Суперадмин: полная коллекция. На ник — ${equipped.length} из ${PF_BADGE_MAX}. Клик по карточке — добавить или снять.`
      : `На ник закреплено ${equipped.length} из ${PF_BADGE_MAX}. Клик по карточке — добавить или снять.`;
  }

  if (grid) {
    grid.innerHTML = PF_BADGES.map((b) =>
      pfBadgeCardHtml(b, unlocked[b.id], equipped, pfBadgeHintText(b, titleById, G.level, achieved, s, hs)),
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
  renderBadgesSection(hs);
  renderAchievementsFromLocal(hs);
}

const PF_TAB_IDS = ['overview', 'achievements', 'badges', 'frames'];

function pfTabIdFromHash() {
  const raw = (typeof location !== 'undefined' && location.hash ? location.hash.slice(1) : '').trim().toLowerCase();
  return PF_TAB_IDS.includes(raw) ? raw : 'overview';
}

function setProfileTab(tabId, opts) {
  const skipHash = opts && opts.skipHash;
  const id = PF_TAB_IDS.includes(tabId) ? tabId : 'overview';
  const tabs = document.querySelectorAll('.pf-tabs [role="tab"][data-pf-tab]');
  const panels = document.querySelectorAll('.pf-panel[data-pf-panel]');

  tabs.forEach((btn) => {
    const on = btn.getAttribute('data-pf-tab') === id;
    btn.classList.toggle('pf-tab--active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
  });

  panels.forEach((panel) => {
    const on = panel.getAttribute('data-pf-panel') === id;
    panel.classList.toggle('pf-panel--active', on);
    panel.toggleAttribute('hidden', !on);
    panel.setAttribute('aria-hidden', on ? 'false' : 'true');
  });

  if (!skipHash && typeof history !== 'undefined' && history.replaceState) {
    const path = `${location.pathname}${location.search}`;
    const nextHash = id === 'overview' ? '' : `#${id}`;
    const url = path + nextHash;
    if (`${location.pathname}${location.search}${location.hash || ''}` !== url) {
      history.replaceState(null, '', url);
    }
  }
}

function initProfileTabs() {
  const nav = document.querySelector('.pf-tabs');
  if (!nav || nav.dataset.pfBound === '1') return;
  nav.dataset.pfBound = '1';

  setProfileTab(pfTabIdFromHash(), { skipHash: true });

  nav.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-pf-tab]');
    if (!btn || btn.getAttribute('role') !== 'tab') return;
    const id = btn.getAttribute('data-pf-tab');
    if (!PF_TAB_IDS.includes(id)) return;
    setProfileTab(id);
  });

  nav.addEventListener('keydown', (ev) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(ev.key)) return;
    const tabs = [...nav.querySelectorAll('[role="tab"][data-pf-tab]')];
    if (!tabs.length) return;
    const i = tabs.findIndex((t) => t.classList.contains('pf-tab--active'));
    if (i < 0) return;
    ev.preventDefault();
    let next = i;
    if (ev.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
    else if (ev.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = tabs.length - 1;
    const id = tabs[next].getAttribute('data-pf-tab');
    setProfileTab(id);
    tabs[next].focus();
  });

  window.addEventListener('hashchange', () => {
    setProfileTab(pfTabIdFromHash(), { skipHash: true });
  });
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
  initProfileTabs();
  window._onAuthUpdate = function () {
    void renderProfileDashboard();
  };
  void renderProfileDashboard();
});
