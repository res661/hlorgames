/**
 * PROFILE.JS — Никнейм, эмодзи-аватар или цвет буквы, фото (URL если когда-нибудь поддержим)
 */

const AVATAR_EMOJIS = [
  '🎮', '🕵️', '🏚️', '🗣️', '👾', '🤖', '🐺', '🦊',
  '🐱', '🐻', '🦁', '🐯', '🎭', '👑', '🔮', '⚔️',
  '🛡️', '🎲', '🃏', '🎯', '🏆', '💎', '🌟', '🔥',
  '⚡', '🌊', '🌙', '🐉', '🦋', '🎪', '🎨', '🚀',
];

/** Тёмная буква на светлых слотах, светлая на тёмных */
const AVATAR_COLORS = [
  '#c8ff4e', '#7c3aed', '#06b6d4', '#f43f5e', '#fb923c', '#eab308',
  '#10b981', '#3b82f6', '#ec4899', '#a855f7', '#64748b', '#f97316',
];

let selectedAvatar = null;

// ─── Аватар: разметка (nav, dropdown, профиль) ─────────────────────────────────

function hlorIsHexAvatar(val) {
  return typeof val === 'string' && /^#[0-9A-Fa-f]{6}$/.test(val.trim());
}

function hlorEscapeAttr(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/'/g, '&#39;');
}

function hlorContrastOnHex(hex6) {
  const h = String(hex6).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#080b08' : '#f8faf7';
}

/**
 * Контент внутри блока `.user-avatar` / большого превью.
 * avatar в БД: URL (http...) | #RRGGBB | один эмодзи или null → буква ника на фоне лайма.
 */
function hlorBuildAvatarInnerHtml(user) {
  const nick = user?.nickname || '?';
  const letter = nick[0] ? nick[0].toUpperCase() : '?';
  const av = user?.avatar;

  if (av && /^https?:\/\//i.test(String(av))) {
    return `<img src="${hlorEscapeAttr(av)}" alt="" width="96" height="96" decoding="async" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
  }
  if (hlorIsHexAvatar(av)) {
    const hex = av.trim();
    const fg = hlorContrastOnHex(hex);
    return `<span class="user-avatar__letter" style="background:${hex};color:${fg}">${letter}</span>`;
  }
  if (av && typeof av === 'string' && av.trim() && !hlorIsHexAvatar(av.trim()) && !/^https?:\/\//i.test(av)) {
    const t = av.trim().slice(0, 24);
    const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<span class="user-avatar__emoji">${esc}</span>`;
  }
  return `<span class="user-avatar__letter user-avatar__letter--plain">${letter}</span>`;
}

window.hlorBuildAvatarInnerHtml = hlorBuildAvatarInnerHtml;

// ─── ОТКРЫТИЕ / ЗАКРЫТИЕ ─────────────────────────────────────────────────────────

function openProfileModal() {
  document.getElementById('userDropdown')?.classList.add('hidden');
  const modal = document.getElementById('profileModal');
  if (!modal) return;

  if (currentUser) {
    document.getElementById('profileNickname').value = currentUser.nickname || '';
    document.getElementById('profileEmail').value = currentUser.email || '';
    selectedAvatar = currentUser.avatar || null;
    updateAvatarPreview();
  }

  buildColorGrid();
  buildEmojiGrid();
  modal.classList.add('open');
  document.getElementById('profileError').textContent = '';
  document.getElementById('profileSuccess').classList.add('hidden');
}

function closeProfileModal() {
  document.getElementById('profileModal')?.classList.remove('open');
}

// ─── ПРЕВЬЮ / СЕТКИ ──────────────────────────────────────────────────────────────

function updateAvatarPreview() {
  const el = document.getElementById('profileAvatarBig');
  if (!el) return;
  const nick = document.getElementById('profileNickname')?.value || currentUser?.nickname || '?';
  const faux = { nickname: nick, avatar: selectedAvatar };

  el.innerHTML = hlorBuildAvatarInnerHtml(faux);
  el.dataset.empty = faux.avatar ? 'false' : 'true';
}

function clearAvatar() {
  selectedAvatar = null;
  updateAvatarPreview();
  buildColorGrid();
  buildEmojiGrid();
}

function buildColorGrid() {
  const grid = document.getElementById('profileColorGrid');
  if (!grid) return;

  grid.innerHTML = AVATAR_COLORS.map((hex) => {
    const on = selectedAvatar && String(selectedAvatar).toLowerCase() === hex.toLowerCase();
    const title = hex;
    return `<button type="button" class="profile-color-btn ${on ? 'active' : ''}" title="${hex}" data-hex="${hex}" onclick="selectColorAvatar('${hex}')" style="--swatch:${hex}"></button>`;
  }).join('');
}

function selectColorAvatar(hex) {
  selectedAvatar = hex;
  buildColorGrid();
  buildEmojiGrid();
  updateAvatarPreview();
}

function buildEmojiGrid() {
  const grid = document.getElementById('profileEmojiGrid');
  if (!grid) return;
  grid.innerHTML = AVATAR_EMOJIS.map(
    em => `
    <button type="button" class="profile-emoji-btn ${selectedAvatar === em ? 'active' : ''}" aria-label="Аватар">${em}</button>`,
  ).join('');
  const btns = grid.querySelectorAll('button.profile-emoji-btn');
  btns.forEach((btn, i) => btn.addEventListener('click', () => selectEmoji(AVATAR_EMOJIS[i])));
}

function selectEmoji(emoji) {
  selectedAvatar = emoji;
  buildEmojiGrid();
  buildColorGrid();
  updateAvatarPreview();
}

// ─── СОХРАНЕНИЕ ──────────────────────────────────────────────────────────────

async function saveProfile() {
  const errEl     = document.getElementById('profileError');
  const successEl = document.getElementById('profileSuccess');
  errEl.textContent = '';
  successEl.classList.add('hidden');

  const nickname = document.getElementById('profileNickname').value.trim();
  if (!nickname || nickname.length < 2) {
    errEl.textContent = 'Ник минимум 2 символа';
    return;
  }

  if (!supabaseClient || !currentUser) {
    errEl.textContent = 'Нет подключения';
    return;
  }

  let avatarPayload = selectedAvatar === null ? null : selectedAvatar;
  if (avatarPayload && !hlorIsHexAvatar(avatarPayload) && !/^https?:\/\//i.test(avatarPayload) && avatarPayload.length > 48) {
    errEl.textContent = 'Странное значение аватара — выбери цвет или эмодзи';
    return;
  }

  const btn = document.querySelector('#profileModal .btn--primary');
  btn.disabled = true;
  btn.textContent = 'Сохраняем...';

  try {
    if (nickname.toLowerCase() !== currentUser.nickname.toLowerCase()) {
      const { data: existing } = await supabaseClient
        .from('profiles').select('id').ilike('nickname', nickname).maybeSingle();
      if (existing) throw new Error('Этот ник уже занят');
    }

    const { error } = await supabaseClient
      .from('profiles')
      .update({ nickname, avatar: avatarPayload })
      .eq('id', currentUser.id);

    if (error) throw error;

    currentUser.nickname = nickname;
    currentUser.avatar   = avatarPayload;
    onUserSignedIn(currentUser);

    successEl.classList.remove('hidden');
    if (typeof renderProfileDashboard === 'function') renderProfileDashboard();
    setTimeout(closeProfileModal, 1000);
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('profileModalClose')?.addEventListener('click', closeProfileModal);
  document.getElementById('profileModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProfileModal();
  });
  document.getElementById('profileNickname')?.addEventListener('input', updateAvatarPreview);
});
