/**
 * top.html — таблица лидеров (leaderboard_stats + опционально snapshot).
 */

const TOP_CATEGORIES = [
  { id: 'hosted_ended', col: 'games_hosted_ended', label: 'Закрыл комнат (хост)' },
  { id: 'played_ended', col: 'games_played_ended', label: 'Сыграл комнат (участник)' },
  { id: 'lobbies_created', col: 'lobbies_created', label: 'Создал комнат всего' },
];

function utcYesterdayIsoDate() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1))
    .toISOString()
    .slice(0, 10);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function fmtDelta(prevRank, currRank, hasPrev) {
  if (!hasPrev || prevRank == null || currRank == null) return { text: '—', cls: 'top-delta--flat' };
  const delta = prevRank - currRank;
  if (delta === 0) return { text: '0', cls: 'top-delta--flat' };
  if (delta > 0)
    return { text: '+' + String(delta), cls: 'top-delta--up' }; // место улучшилось
  return { text: String(delta), cls: 'top-delta--down' };
}

function initTopNavbar() {
  const burgerBtn = document.getElementById('burgerBtn');
  const navLinks = document.getElementById('navLinks');
  const navAuth = document.getElementById('navAuth');
  burgerBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
    navAuth?.classList.toggle('open');
  });
  document.querySelectorAll('.top-page .nav-link').forEach((link) => {
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

function fillCategorySelect(sel) {
  if (!sel) return;
  sel.innerHTML = TOP_CATEGORIES.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('');
}

async function fetchNicknames(ids) {
  const out = {};
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniq.length || typeof supabaseClient === 'undefined' || !supabaseClient) return out;
  const chunk = 80;
  for (let i = 0; i < uniq.length; i += chunk) {
    const part = uniq.slice(i, i + chunk);
    const { data, error } = await supabaseClient.from('profiles').select('id, nickname').in('id', part);
    if (error) continue;
    (data || []).forEach((r) => {
      if (r?.id) out[String(r.id)] = r.nickname || 'Игрок';
    });
  }
  return out;
}

async function fetchPrevRanks(catId, snapshotDate) {
  const prev = {};
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return prev;
  const { data, error } = await supabaseClient
    .from('leaderboard_snapshot')
    .select('user_id,rank')
    .eq('snapshot_at', snapshotDate)
    .eq('category', catId);
  if (error || !Array.isArray(data)) return prev;
  data.forEach((row) => {
    if (row?.user_id) prev[String(row.user_id)] = row.rank;
  });
  return prev;
}

async function loadTopBoard() {
  const catSel = document.getElementById('top-category');
  const orderSel = document.getElementById('top-order');
  const tbody = document.getElementById('top-tbody');
  const note = document.getElementById('top-snapshot-note');
  if (!tbody) return;

  const catId = catSel?.value || TOP_CATEGORIES[0].id;
  const desc = orderSel?.value !== 'asc';
  const col = TOP_CATEGORIES.find((x) => x.id === catId)?.col || 'games_hosted_ended';

  tbody.innerHTML = '<tr><td colspan="4" style="padding:18px;text-align:center">Загрузка…</td></tr>';

  if (typeof supabaseClient === 'undefined' || !supabaseClient) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="padding:18px;color:var(--red)">Нет клиента БД.</td></tr>';
    return;
  }

  const snapDay = utcYesterdayIsoDate();
  let prevRankMap = {};
  try {
    prevRankMap = await fetchPrevRanks(catId, snapDay);
  } catch (_) {
    prevRankMap = {};
  }

  const hasPrevData = Object.keys(prevRankMap).length > 0;
  if (note) {
    note.textContent = hasPrevData
      ? 'Колонка «± к вчера» сравнивает место на снимке за UTC-вчера — запуск через SQL функцию capture_leaderboard_snapshot (cron).'
      : '± к вчера появится после первого сохранения снимка за вчера (Supabase → SQL: select capture_leaderboard_snapshot((timezone(\'utc\', now()))::date - 1));).';
  }

  const { data, error } = await supabaseClient
    .from('leaderboard_stats')
    .select('user_id, lobbies_created, games_hosted_ended, games_played_ended')
    .order(col, { ascending: !desc })
    .limit(100);

  if (error) {
    const msg = String(error.message || error);
    const missing = /leaderboard_stats|42P01|schema cache/i.test(msg);
    tbody.innerHTML = `<tr><td colspan="4" style="padding:18px;color:var(--red)">${
      missing
        ? 'Таблица топа не найдена — выполни SQL из supabase/leaderboard.sql в Supabase.'
        : escapeHtml(msg)
    }</td></tr>`;
    return;
  }

  const rows = Array.isArray(data) ? data.filter((r) => (r[col] ?? 0) > 0) : [];
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" style="padding:18px;text-align:center;opacity:0.85">Пока пусто — создай лобби или закрой комнату как хост, чтобы попасть в топ.</td></tr>';
    return;
  }

  const nicks = await fetchNicknames(rows.map((r) => r.user_id));

  const sorted = [...rows].sort((a, b) => {
    const va = a[col] ?? 0;
    const vb = b[col] ?? 0;
    if (va !== vb) return desc ? vb - va : va - vb;
    return String(a.user_id).localeCompare(String(b.user_id));
  });

  tbody.innerHTML = sorted
    .map((row, idx) => {
      const rank = idx + 1;
      const uid = String(row.user_id);
      const nick = nicks[uid] || 'Игрок';
      const val = row[col] ?? 0;
      const prevR = prevRankMap[uid];
      const d = fmtDelta(prevR, rank, hasPrevData);
      const rkClass = rank === 1 ? 'top-rank--1' : rank === 2 ? 'top-rank--2' : rank === 3 ? 'top-rank--3' : '';
      return `<tr>
        <td class="top-rank ${rkClass}">#${rank}</td>
        <td class="top-nick">${escapeHtml(nick)}</td>
        <td class="top-val">${escapeHtml(String(val))}</td>
        <td class="top-delta ${d.cls}">${escapeHtml(d.text)}</td>
      </tr>`;
    })
    .join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initTopNavbar();
  fillCategorySelect(document.getElementById('top-category'));
  document.getElementById('top-category')?.addEventListener('change', () => void loadTopBoard());
  document.getElementById('top-order')?.addEventListener('change', () => void loadTopBoard());
  document.getElementById('top-refresh-btn')?.addEventListener('click', () => void loadTopBoard());
  void loadTopBoard();
});
