/**
 * ADMIN.JS — Панель администратора HlorGames
 */

let adminUser = null;
let allUsers  = [];

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Ждём инициализации supabaseClient клиента
  await new Promise(r => setTimeout(r, 300));

  if (!supabaseClient) {
    showAccessDenied('supabaseClient не подключён');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'superadmin') {
    showAccessDenied('Панель доступна только суперадмину (role = superadmin в таблице profiles)');
    return;
  }

  adminUser = { ...session.user, ...profile };

  // Обновляем UI
  const roleBadge = document.getElementById('roleBadge');
  roleBadge.textContent = profile.role === 'superadmin' ? '👑 Суперадмин' : '🛡️ Админ';

  const userInfo = document.getElementById('adminUserInfo');
  userInfo.innerHTML = `
    <div class="a-user-avatar a-user-avatar--admin">${profile.nickname[0].toUpperCase()}</div>
    <span class="a-user-name">${profile.nickname}</span>
  `;

  // Заполняем инфо в настройках
  const infoUrl = document.getElementById('infoUrl');
  if (infoUrl) infoUrl.textContent = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '—';
  const infoDbStatus = document.getElementById('infoDbStatus');
  if (infoDbStatus) infoDbStatus.innerHTML = '<span style="color:var(--green)">✓ Подключено</span>';

  // Грузим все разделы сразу
  loadDashboard();
  loadUsers();
  loadLobbies();
});

function showAccessDenied(msg) {
  document.getElementById('adminMain').innerHTML = `
    <div class="a-denied">
      <div class="a-denied-icon">🚫</div>
      <h2>${msg}</h2>
      <p>Только администраторы могут открыть эту страницу.</p>
      <a href="index.html" class="btn btn--primary" style="margin-top:1.5rem">← Вернуться на сайт</a>
    </div>
  `;
}

// ─── НАВИГАЦИЯ ────────────────────────────────────────────────────────────────

function showSection(name) {
  document.querySelectorAll('.a-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.admin-nav__item').forEach(b => b.classList.remove('active'));

  const section = document.getElementById(`section-${name}`);
  const navBtn  = document.getElementById(`nav-${name}`);
  if (section) section.classList.remove('hidden');
  if (navBtn)  navBtn.classList.add('active');

  const titles = { dashboard: 'Дашборд', users: 'Игроки', lobbies: 'Лобби', settings: 'Настройки' };
  document.getElementById('pageTitle').textContent = titles[name] || name;

  // Закрываем сайдбар на мобилке
  document.getElementById('adminSidebar').classList.remove('open');
}

function toggleSidebar() {
  document.getElementById('adminSidebar').classList.toggle('open');
}

// ─── ДАШБОРД ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [
      { count: totalUsers },
      { count: waitingLobbies },
      { count: totalLobbies },
      { count: adminCount },
      { data: recent },
    ] = await Promise.all([
      supabaseClient.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseClient.from('lobbies').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
      supabaseClient.from('lobbies').select('*', { count: 'exact', head: true }),
      supabaseClient.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['admin', 'superadmin']),
      supabaseClient.from('profiles').select('nickname, role, created_at').order('created_at', { ascending: false }).limit(6),
    ]);

    document.getElementById('statUsers').textContent   = totalUsers    ?? 0;
    document.getElementById('statOnline').textContent  = waitingLobbies ?? 0;
    document.getElementById('statLobbies').textContent = totalLobbies   ?? 0;
    document.getElementById('statAdmins').textContent  = adminCount     ?? 0;

    const wrap = document.getElementById('recentUsersWrap');
    if (!recent?.length) {
      wrap.innerHTML = '<p class="a-empty">Пока никто не зарегистрировался</p>';
      return;
    }
    wrap.innerHTML = `
      <table class="a-table">
        <thead><tr><th>Ник</th><th>Роль</th><th>Дата</th></tr></thead>
        <tbody>
          ${recent.map(u => `
            <tr>
              <td><strong>${esc(u.nickname)}</strong></td>
              <td>${roleBadge(u.role)}</td>
              <td>${fmtDate(u.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

// ─── ИГРОКИ ───────────────────────────────────────────────────────────────────

async function loadUsers() {
  const wrap = document.getElementById('usersWrap');
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allUsers = data || [];
    renderUsers(allUsers);
    document.getElementById('usersCount').textContent = `${allUsers.length} игроков`;
  } catch (err) {
    wrap.innerHTML = `<p class="a-error">Ошибка: ${esc(err.message)}</p>`;
  }
}

function filterUsers() {
  const q = document.getElementById('userSearch').value.toLowerCase();
  const filtered = allUsers.filter(u => u.nickname.toLowerCase().includes(q));
  renderUsers(filtered);
}

function renderUsers(users) {
  const wrap = document.getElementById('usersWrap');
  if (!users.length) {
    wrap.innerHTML = '<p class="a-empty">Ничего не найдено</p>';
    return;
  }
  wrap.innerHTML = `
    <table class="a-table">
      <thead>
        <tr>
          <th>Ник</th>
          <th>Роль</th>
          <th>Дата регистрации</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => {
          const isSelf       = u.id === adminUser?.id;
          const isSuperadmin = u.role === 'superadmin';
          return `
            <tr>
              <td>
                <strong>${esc(u.nickname)}</strong>
                ${isSelf ? '<span class="a-self-tag">(Вы)</span>' : ''}
              </td>
              <td>${roleBadge(u.role)}</td>
              <td>${fmtDate(u.created_at)}</td>
              <td class="a-actions">
                ${!isSelf && !isSuperadmin ? `
                  ${u.role === 'admin'
                    ? `<button class="btn a-btn-sm a-btn-ghost" onclick="changeRole('${u.id}','user','${esc(u.nickname)}')">Разжаловать</button>`
                    : `<button class="btn a-btn-sm a-btn-accent" onclick="changeRole('${u.id}','admin','${esc(u.nickname)}')">👑 В админы</button>`
                  }
                  <button class="btn a-btn-sm a-btn-danger" onclick="confirmDelete('${u.id}','${esc(u.nickname)}')">Удалить</button>
                ` : '<span class="a-dash">—</span>'}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function changeRole(userId, newRole, nickname) {
  if (!confirm(`Изменить роль «${nickname}» на «${newRole}»?`)) return;
  try {
    const { error } = await supabaseClient
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (error) throw error;
    showToast(`Роль ${nickname} → ${newRole}`, 'success');
    loadUsers();
    loadDashboard();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

async function confirmDelete(userId, nickname) {
  if (!confirm(`Удалить игрока «${nickname}»?\nЭто действие нельзя отменить.`)) return;
  try {
    const { error } = await supabaseClient.from('profiles').delete().eq('id', userId);
    if (error) throw error;
    showToast(`Игрок ${nickname} удалён`, 'success');
    allUsers = allUsers.filter(u => u.id !== userId);
    renderUsers(allUsers);
    document.getElementById('usersCount').textContent = `${allUsers.length} игроков`;
    loadDashboard();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

// ─── ЛОББИ ────────────────────────────────────────────────────────────────────

async function loadLobbies() {
  const wrap = document.getElementById('lobbiesWrap');
  try {
    const { data, error } = await supabaseClient
      .from('lobbies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const lobbies = data || [];
    document.getElementById('lobbiesCount').textContent = `${lobbies.length} комнат`;

    if (!lobbies.length) {
      wrap.innerHTML = '<p class="a-empty">Лобби нет</p>';
      return;
    }

    const gameNames = { mafia: '🕵️ Мафия', bunker: '🏚️ Бункер', alias: '🗣️ Алиас', whoami: '❔ Кто я?' };
    wrap.innerHTML = `
      <table class="a-table">
        <thead>
          <tr>
            <th>Код</th><th>Игра</th><th>Статус</th>
            <th>Каталог</th>
            <th>Игроков</th><th>Создано</th><th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${lobbies.map(l => `
            <tr>
              <td><code class="a-room-code">${esc(l.code)}</code></td>
              <td>${gameNames[l.game] || l.game}</td>
              <td>${statusBadge(l.status)}</td>
              <td>${l.hide_from_public ? '<span class="a-badge a-badge--gray">Скрыто</span>' : 'В списках'}</td>
              <td>${Array.isArray(l.players) ? l.players.length : 0}</td>
              <td>${fmtDate(l.created_at)}</td>
              <td class="a-actions">
                <button class="btn a-btn-sm a-btn-danger" onclick="deleteLobby('${l.id}','${esc(l.code)}')">
                  Закрыть
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    wrap.innerHTML = `<p class="a-error">Ошибка: ${esc(err.message)}</p>`;
  }
}

async function deleteLobby(lobbyId, code) {
  if (!confirm(`Закрыть лобби ${code}?`)) return;
  try {
    const { error } = await supabaseClient.from('lobbies').delete().eq('id', lobbyId);
    if (error) throw error;
    showToast(`Лобби ${code} закрыто`, 'success');
    loadLobbies();
    loadDashboard();
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

// ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────────

async function cleanupLobbies() {
  const res = document.getElementById('cleanupResult');
  res.textContent = 'Очищаю...';
  try {
    const { error, count } = await supabaseClient
      .from('lobbies')
      .delete({ count: 'exact' })
      .eq('status', 'ended');
    if (error) throw error;
    res.textContent = `Удалено ${count ?? 0} завершённых лобби`;
    loadLobbies();
    loadDashboard();
  } catch (err) {
    res.textContent = 'Ошибка: ' + err.message;
  }
}

// ─── ВСПОМОГАТЕЛЬНЫЕ ─────────────────────────────────────────────────────────

function roleBadge(role) {
  const map = {
    superadmin: '<span class="a-badge a-badge--gold">👑 Суперадмин</span>',
    admin:      '<span class="a-badge a-badge--blue">🛡️ Админ</span>',
    user:       '<span class="a-badge a-badge--gray">Игрок</span>',
  };
  return map[role] || map.user;
}

function statusBadge(status) {
  const map = {
    waiting: '<span class="a-badge a-badge--green">Ожидание</span>',
    active:  '<span class="a-badge a-badge--blue">Идёт игра</span>',
    ended:   '<span class="a-badge a-badge--gray">Завершена</span>',
  };
  return map[status] || `<span class="a-badge">${esc(status)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
