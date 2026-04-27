/**
 * PROFILE.JS — Настройки профиля (никнейм + аватар)
 */

const AVATAR_EMOJIS = [
  '🎮','🕵️','🏚️','🗣️','👾','🤖','🐺','🦊',
  '🐱','🐻','🦁','🐯','🎭','👑','🔮','⚔️',
  '🛡️','🎲','🃏','🎯','🏆','💎','🌟','🔥',
  '⚡','🌊','🌙','🐉','🦋','🎪','🎨','🚀',
];

let selectedAvatar = null;

// ─── ОТКРЫТИЕ ────────────────────────────────────────────────────────────────

function openProfileModal() {
  // Закрыть дропдаун
  document.getElementById('userDropdown')?.classList.add('hidden');

  const modal = document.getElementById('profileModal');
  if (!modal) return;

  // Заполняем поля текущими данными
  if (currentUser) {
    document.getElementById('profileNickname').value = currentUser.nickname || '';
    document.getElementById('profileEmail').value    = currentUser.email    || '';
    selectedAvatar = currentUser.avatar || null;
    updateProfileAvatarPreview();
  }

  // Строим сетку эмодзи
  buildEmojiGrid();

  modal.classList.add('open');
  document.getElementById('profileError').textContent   = '';
  document.getElementById('profileSuccess').classList.add('hidden');
}

function closeProfileModal() {
  document.getElementById('profileModal')?.classList.remove('open');
}

// ─── СЕТКА ЭМОДЗИ ────────────────────────────────────────────────────────────

function buildEmojiGrid() {
  const grid = document.getElementById('profileEmojiGrid');
  if (!grid) return;

  grid.innerHTML = AVATAR_EMOJIS.map(em => `
    <button
      class="profile-emoji-btn ${selectedAvatar === em ? 'active' : ''}"
      onclick="selectAvatar('${em}')"
      title="${em}"
    >${em}</button>
  `).join('');
}

function selectAvatar(emoji) {
  selectedAvatar = emoji;
  buildEmojiGrid();
  updateProfileAvatarPreview();
}

function updateProfileAvatarPreview() {
  const el = document.getElementById('profileAvatarBig');
  if (!el) return;
  if (selectedAvatar) {
    el.textContent = selectedAvatar;
    el.dataset.hasEmoji = 'true';
  } else {
    const nick = document.getElementById('profileNickname')?.value || currentUser?.nickname || '?';
    el.textContent = nick[0].toUpperCase();
    el.dataset.hasEmoji = 'false';
  }
}

// ─── СОХРАНЕНИЕ ──────────────────────────────────────────────────────────────

async function saveProfile() {
  const errEl     = document.getElementById('profileError');
  const successEl = document.getElementById('profileSuccess');
  errEl.textContent = '';
  successEl.classList.add('hidden');

  const nickname = document.getElementById('profileNickname').value.trim();

  if (!nickname || nickname.length < 2) {
    errEl.textContent = 'Ник должен быть минимум 2 символа';
    return;
  }

  if (!supabaseClient || !currentUser) {
    errEl.textContent = 'Нет подключения';
    return;
  }

  const btn = document.querySelector('#profileModal .btn--primary');
  btn.disabled = true;
  btn.textContent = 'Сохраняем...';

  try {
    // Проверяем уникальность ника (если изменился)
    if (nickname.toLowerCase() !== currentUser.nickname.toLowerCase()) {
      const { data: existing } = await supabaseClient
        .from('profiles')
        .select('id')
        .ilike('nickname', nickname)
        .maybeSingle();

      if (existing) {
        throw new Error('Этот ник уже занят');
      }
    }

    const updates = { nickname };
    if (selectedAvatar !== undefined) updates.avatar = selectedAvatar || null;

    const { error } = await supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', currentUser.id);

    if (error) throw error;

    // Обновляем локальное состояние
    currentUser.nickname = nickname;
    if (selectedAvatar !== undefined) currentUser.avatar = selectedAvatar;

    // Перерисовываем навбар
    onUserSignedIn(currentUser);

    successEl.classList.remove('hidden');
    setTimeout(() => closeProfileModal(), 1200);

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
  document.getElementById('profileNickname')?.addEventListener('input', updateProfileAvatarPreview);
});
