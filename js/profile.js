/**
 * PROFILE.JS — Настройки профиля (никнейм + аватар фото/эмодзи)
 */

const AVATAR_EMOJIS = [
  '🎮','🕵️','🏚️','🗣️','👾','🤖','🐺','🦊',
  '🐱','🐻','🦁','🐯','🎭','👑','🔮','⚔️',
  '🛡️','🎲','🃏','🎯','🏆','💎','🌟','🔥',
  '⚡','🌊','🌙','🐉','🦋','🎪','🎨','🚀',
];

let selectedAvatar = null; // null = initials, 'emoji' = emoji, 'https://...' = photo URL
let uploadedPhotoUrl = null;

// ─── ОТКРЫТИЕ / ЗАКРЫТИЕ ─────────────────────────────────────────────────────

function openProfileModal() {
  document.getElementById('userDropdown')?.classList.add('hidden');
  const modal = document.getElementById('profileModal');
  if (!modal) return;

  if (currentUser) {
    document.getElementById('profileNickname').value = currentUser.nickname || '';
    document.getElementById('profileEmail').value    = currentUser.email    || '';
    selectedAvatar   = currentUser.avatar || null;
    uploadedPhotoUrl = currentUser.avatar?.startsWith('http') ? currentUser.avatar : null;
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

// ─── АВАТАР PREVIEW ──────────────────────────────────────────────────────────

function updateAvatarPreview() {
  const el = document.getElementById('profileAvatarBig');
  if (!el) return;

  if (selectedAvatar && selectedAvatar.startsWith('http')) {
    el.innerHTML = `<img src="${selectedAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    el.dataset.hasEmoji = 'false';
  } else if (selectedAvatar) {
    el.textContent = selectedAvatar;
    el.dataset.hasEmoji = 'true';
  } else {
    const nick = document.getElementById('profileNickname')?.value || currentUser?.nickname || '?';
    el.textContent = nick[0].toUpperCase();
    el.dataset.hasEmoji = 'false';
  }
}

function clearAvatar() {
  selectedAvatar   = null;
  uploadedPhotoUrl = null;
  document.getElementById('profilePhotoInput').value = '';
  updateAvatarPreview();
  buildEmojiGrid();
}

// ─── EMOJI GRID ───────────────────────────────────────────────────────────────

function buildEmojiGrid() {
  const grid = document.getElementById('profileEmojiGrid');
  if (!grid) return;
  grid.innerHTML = AVATAR_EMOJIS.map(em => `
    <button class="profile-emoji-btn ${selectedAvatar === em ? 'active' : ''}"
      onclick="selectEmoji('${em}')">${em}</button>
  `).join('');
}

function selectEmoji(emoji) {
  selectedAvatar   = emoji;
  uploadedPhotoUrl = null;
  document.getElementById('profilePhotoInput').value = '';
  buildEmojiGrid();
  updateAvatarPreview();
}

// ─── ЗАГРУЗКА ФОТО ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('profilePhotoInput');
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        document.getElementById('profileError').textContent = 'Файл слишком большой (макс 2 МБ)';
        return;
      }

      // Предпросмотр сразу
      const reader = new FileReader();
      reader.onload = (ev) => {
        selectedAvatar = ev.target.result; // data URL для preview
        updateAvatarPreview();
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('profileModalClose')?.addEventListener('click', closeProfileModal);
  document.getElementById('profileModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProfileModal();
  });
  document.getElementById('profileNickname')?.addEventListener('input', updateAvatarPreview);
});

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
    // Проверка уникальности ника
    if (nickname.toLowerCase() !== currentUser.nickname.toLowerCase()) {
      const { data: existing } = await supabaseClient
        .from('profiles').select('id').ilike('nickname', nickname).maybeSingle();
      if (existing) throw new Error('Этот ник уже занят');
    }

    let avatarUrl = selectedAvatar;

    // Загружаем фото в Supabase Storage если выбрали файл
    const fileInput = document.getElementById('profilePhotoInput');
    if (fileInput?.files[0]) {
      const file = fileInput.files[0];
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `${currentUser.id}.${ext}`;

      const { error: uploadErr } = await supabaseClient.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) {
        // Если бакет не создан — говорим что нужно сделать
        if (uploadErr.message.includes('Bucket not found') || uploadErr.statusCode === 404) {
          throw new Error('Создай bucket "avatars" в Supabase → Storage → New bucket');
        }
        throw uploadErr;
      }

      const { data: urlData } = supabaseClient.storage
        .from('avatars').getPublicUrl(path);
      avatarUrl = urlData.publicUrl + '?t=' + Date.now(); // cache busting
    }

    // Сохраняем в profiles
    const { error } = await supabaseClient
      .from('profiles')
      .update({ nickname, avatar: avatarUrl || null })
      .eq('id', currentUser.id);

    if (error) throw error;

    currentUser.nickname = nickname;
    currentUser.avatar   = avatarUrl || null;
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
