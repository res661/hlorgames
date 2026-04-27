/**
 * PROFILE.JS — Настройки профиля (никнейм + эмодзи аватар)
 */

const AVATAR_EMOJIS = [
  '🎮','🕵️','🏚️','🗣️','👾','🤖','🐺','🦊',
  '🐱','🐻','🦁','🐯','🎭','👑','🔮','⚔️',
  '🛡️','🎲','🃏','🎯','🏆','💎','🌟','🔥',
  '⚡','🌊','🌙','🐉','🦋','🎪','🎨','🚀',
];

let selectedAvatar = null;

// ─── ОТКРЫТИЕ / ЗАКРЫТИЕ ─────────────────────────────────────────────────────

function openProfileModal() {
  document.getElementById('userDropdown')?.classList.add('hidden');
  const modal = document.getElementById('profileModal');
  if (!modal) return;

  if (currentUser) {
    document.getElementById('profileNickname').value = currentUser.nickname || '';
    document.getElementById('profileEmail').value    = currentUser.email    || '';
    selectedAvatar = currentUser.avatar || null;
    updateAvatarPreview();
  }

  buildEmojiGrid();
  modal.classList.add('open');
  document.getElementById('profileError').textContent = '';
  document.getElementById('profileSuccess').classList.add('hidden');
}

function closeProfileModal() {
  document.getElementById('profileModal')?.classList.remove('open');
}

// ─── АВАТАР ──────────────────────────────────────────────────────────────────

function updateAvatarPreview() {
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

function clearAvatar() {
  selectedAvatar = null;
  updateAvatarPreview();
  buildEmojiGrid();
}

function buildEmojiGrid() {
  const grid = document.getElementById('profileEmojiGrid');
  if (!grid) return;
  grid.innerHTML = AVATAR_EMOJIS.map(em => `
    <button class="profile-emoji-btn ${selectedAvatar === em ? 'active' : ''}"
      onclick="selectEmoji('${em}')">${em}</button>
  `).join('');
}

function selectEmoji(emoji) {
  selectedAvatar = emoji;
  buildEmojiGrid();
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
      .update({ nickname, avatar: selectedAvatar || null })
      .eq('id', currentUser.id);

    if (error) throw error;

    currentUser.nickname = nickname;
    currentUser.avatar   = selectedAvatar || null;
    onUserSignedIn(currentUser);

    successEl.classList.remove('hidden');
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
