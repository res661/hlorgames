/**
 * MAFIA-PLAY.JS
 * Игровая страница Мафии — три уровня доступа:
 *   HOST   — полный контроль: роли, фазы, таймер, редактирование слотов
 *   PLAYER — только видит сетку и может голосовать, видит свою роль
 *   (определяется через URL: ?role=host или ?role=player&slot=N)
 */

(function () {
  'use strict';

  // ── URL параметры ──────────────────────────────────────────────
  const params    = new URLSearchParams(window.location.search);
  const urlRole   = params.get('role') || 'player';   // 'host' | 'player'
  const urlSlot   = parseInt(params.get('slot') ?? '-1'); // номер слота игрока (0-based)
  const IS_HOST   = urlRole === 'host';

  // ── Константы ─────────────────────────────────────────────────
  const TOTAL_SLOTS = 12;
  const ROLE_CLASSES = {
    'Мафия':     'mafia',
    'Шериф':     'sheriff',
    'Доктор':    'doctor',
    'Маньяк':    'maniac',
    'Мирный':    'civil',
  };
  const STATUS_LABELS = { alive: 'ЖИВ', dead: 'МЁРТВ', extinct: 'ВЫБЫЛ' };
  const PHASES = {
    day:   { icon: '☀️', text: 'ДЕНЬ — Обсуждение',       css: 'phase-day'  },
    night: { icon: '🌙', text: 'НОЧЬ — Мафия действует',  css: 'phase-night'},
    vote:  { icon: '🗳️', text: 'ГОЛОСОВАНИЕ',              css: 'phase-vote' },
    wait:  { icon: '⏳', text: 'Ожидание игроков...',      css: 'phase-wait' },
  };

  // ── Состояние ─────────────────────────────────────────────────
  let activeSlots   = 12;
  let gridColumns   = 4;
  let currentPhase  = 'wait';
  let timerInterval = null;
  let randomEventQueued = false;
  let editingSlot   = null;
  let slots         = loadSlots();

  // ── DOM ───────────────────────────────────────────────────────
  const grid         = document.getElementById('mafiaGrid');
  const phaseIcon    = document.getElementById('phaseIcon');
  const phaseText    = document.getElementById('phaseText');
  const timerEl      = document.getElementById('timerEl');
  const roomNameEl   = document.getElementById('roomName');
  const myRoleWrap   = document.getElementById('myRoleWrap');
  const myRoleValue  = document.getElementById('myRoleValue');
  const hostTopCtrl  = document.getElementById('hostTopControls');
  const adminPanel   = document.getElementById('adminPanel');
  const adminOverlay = document.getElementById('adminPanelOverlay');

  // ── Инициализация ─────────────────────────────────────────────
  function init() {
    applyStoredSettings();
    renderGrid();
    setupRoleUI();
    setupAdminPanel();
    setupSlotModal();
    setupHotkeys();
  }

  // ── Роль-based UI ─────────────────────────────────────────────
  function setupRoleUI() {
    if (IS_HOST) {
      hostTopCtrl.classList.remove('hidden');
      document.getElementById('btnAdminPanel').onclick = openPanel;
    } else {
      // Показываем роль игрока если слот назначен
      if (urlSlot >= 0 && urlSlot < TOTAL_SLOTS) {
        const slot = slots[urlSlot];
        if (slot?.role) {
          myRoleWrap.classList.remove('hidden');
          myRoleValue.textContent = slot.role;
          const cls = ROLE_CLASSES[slot.role] || 'other';
          myRoleValue.className = `mafia-my-role__value mf-slot__role--${cls}`;
        }
      }
    }
  }

  // ── Сетка ─────────────────────────────────────────────────────
  function renderGrid() {
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${gridColumns}, 1fr)`;
    for (let i = 0; i < activeSlots; i++) {
      grid.appendChild(createSlot(i));
    }
  }

  function renderSlot(i) {
    const existing = grid.querySelector(`[data-idx="${i}"]`);
    const updated  = createSlot(i);
    if (existing) existing.replaceWith(updated);
    else renderGrid();
  }

  function createSlot(i) {
    const s   = slots[i];
    const div = document.createElement('div');
    div.className = 'mf-slot';
    div.dataset.idx = i;

    const configured = !!(s.name || s.vdoUrl);
    if (configured) div.classList.add(`mf-slot--${s.status}`);

    // Номер
    const num = document.createElement('div');
    num.className = 'mf-slot__num';
    num.textContent = `${i + 1}`;
    div.appendChild(num);

    // Кнопка редактирования (только хост)
    if (IS_HOST) {
      const editBtn = document.createElement('button');
      editBtn.className = 'mf-slot__edit';
      editBtn.textContent = '✎ Изм.';
      editBtn.addEventListener('click', e => { e.stopPropagation(); openSlotEditor(i); });
      div.appendChild(editBtn);
    }

    // Видео или плейсхолдер
    if (s.vdoUrl && s.status !== 'extinct') {
      const iframe = document.createElement('iframe');
      iframe.className = 'mf-slot__video';
      iframe.src = normalizeVdo(s.vdoUrl);
      iframe.allow = 'autoplay; camera; microphone; fullscreen';
      iframe.setAttribute('allowfullscreen', '');
      div.appendChild(iframe);
    } else {
      const ph = document.createElement('div');
      ph.className = 'mf-slot__placeholder';
      ph.innerHTML = configured && s.status === 'extinct'
        ? `<span class="mf-slot__placeholder-icon">🚫</span><span>ВЫБЫЛ</span>`
        : `<span class="mf-slot__placeholder-icon">📷</span><span>${s.name || `Слот ${i+1}`}</span>`;
      div.appendChild(ph);
    }

    // Нижний оверлей
    if (configured) {
      const ov = document.createElement('div');
      ov.className = 'mf-slot__overlay';

      const info = document.createElement('div');
      info.className = 'mf-slot__info';

      const nameEl = document.createElement('div');
      nameEl.className = 'mf-slot__name';
      nameEl.textContent = s.name || `Слот ${i+1}`;
      info.appendChild(nameEl);

      // Роль — только хосту
      if (IS_HOST && s.role) {
        const roleEl = document.createElement('div');
        const cls = ROLE_CLASSES[s.role] || 'other';
        roleEl.className = `mf-slot__role mf-slot__role--${cls}`;
        roleEl.textContent = s.role;
        info.appendChild(roleEl);
      }

      // Статус
      const statusEl = document.createElement('div');
      statusEl.className = `mf-slot__status mf-slot__status--${s.status}`;
      statusEl.textContent = STATUS_LABELS[s.status] || '';
      info.appendChild(statusEl);

      ov.appendChild(info);

      // Голосование
      const votes = document.createElement('div');
      votes.className = 'mf-slot__votes';

      const btnMinus = document.createElement('button');
      btnMinus.className = 'mf-vote-btn';
      btnMinus.innerHTML = '−';
      btnMinus.addEventListener('click', e => {
        e.stopPropagation();
        if (s.votes > 0) { s.votes--; countEl.textContent = s.votes; saveSlots(); }
      });

      const countEl = document.createElement('span');
      countEl.className = 'mf-vote-count';
      countEl.textContent = s.votes || 0;

      const btnPlus = document.createElement('button');
      btnPlus.className = 'mf-vote-btn';
      btnPlus.innerHTML = '+';
      btnPlus.addEventListener('click', e => {
        e.stopPropagation();
        s.votes++;
        countEl.textContent = s.votes;
        saveSlots();
      });

      votes.appendChild(btnMinus);
      votes.appendChild(countEl);
      votes.appendChild(btnPlus);
      ov.appendChild(votes);

      div.appendChild(ov);
    }

    // Клик по слоту — хост открывает редактор
    if (IS_HOST) div.addEventListener('click', () => openSlotEditor(i));

    return div;
  }

  // ── Слот editor ───────────────────────────────────────────────
  function setupSlotModal() {
    document.getElementById('btnCloseSlot').onclick = closeSlotModal;
    document.getElementById('slotModal').addEventListener('click', e => {
      if (e.target === document.getElementById('slotModal')) closeSlotModal();
    });
    document.getElementById('btnSaveSlot').onclick = saveSlot;
    document.getElementById('btnClearSlot').onclick = clearSlot;
  }

  function openSlotEditor(i) {
    if (!IS_HOST) return;
    editingSlot = i;
    const s = slots[i];
    document.getElementById('slotModalTitle').textContent = `Слот #${i+1}`;
    document.getElementById('slotName').value   = s.name   || '';
    document.getElementById('slotVdo').value    = s.vdoUrl || '';
    document.getElementById('slotRole').value   = s.role   || '';
    document.getElementById('slotStatus').value = s.status || 'extinct';
    document.getElementById('slotModal').classList.add('open');
  }

  function closeSlotModal() {
    document.getElementById('slotModal').classList.remove('open');
    editingSlot = null;
  }

  function saveSlot() {
    if (editingSlot === null) return;
    const s = slots[editingSlot];
    s.name   = document.getElementById('slotName').value.trim();
    s.vdoUrl = document.getElementById('slotVdo').value.trim();
    s.role   = document.getElementById('slotRole').value;
    s.status = document.getElementById('slotStatus').value;
    saveSlots();
    renderSlot(editingSlot);
    renderAdminPlayers();
    closeSlotModal();
    showToast(`Слот #${editingSlot+1} сохранён`, 'success');
  }

  function clearSlot() {
    if (editingSlot === null) return;
    slots[editingSlot] = defaultSlot();
    saveSlots();
    renderSlot(editingSlot);
    renderAdminPlayers();
    closeSlotModal();
    showToast(`Слот #${editingSlot+1} очищен`);
  }

  // ── Панель хоста ──────────────────────────────────────────────
  function setupAdminPanel() {
    document.getElementById('btnClosePanel').onclick = closePanel;
    adminOverlay.onclick = closePanel;

    // Табы панели
    document.querySelectorAll('.mafia-panel__tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mafia-panel__tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mafia-panel__content').forEach(c => { c.classList.add('hidden'); c.classList.remove('active'); });
        btn.classList.add('active');
        const panel = document.getElementById(`ptab-${btn.dataset.ptab}`);
        if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
      });
    });

    // Фазы
    document.querySelectorAll('.mafia-phase-btn').forEach(btn => {
      btn.addEventListener('click', () => setPhase(btn.dataset.phase));
    });

    // Таймер
    document.getElementById('btnStartTimer').onclick = () => {
      const sec = parseInt(document.getElementById('timerSeconds').value) || 60;
      startTimer(sec);
    };
    document.getElementById('btnStopTimer').onclick = stopTimer;

    // Действия
    document.getElementById('btnResetVotes').onclick = () => {
      slots.forEach(s => s.votes = 0);
      saveSlots(); renderGrid();
      showToast('Голоса сброшены');
    };
    document.getElementById('btnReviveAll').onclick = () => {
      slots.forEach(s => { if (s.status === 'dead') s.status = 'alive'; });
      saveSlots(); renderGrid(); renderAdminPlayers();
      showToast('Все воскрешены', 'success');
    };
    document.getElementById('btnResetGame').onclick = resetGame;
    document.getElementById('btnRandomEvent').onclick = toggleRandomEvent;

    // Настройки
    document.getElementById('btnApplySlots').onclick = () => {
      activeSlots = Math.max(1, Math.min(12, parseInt(document.getElementById('settingSlots').value) || 12));
      renderGrid();
    };
    document.getElementById('btnApplyGrid').onclick = () => {
      gridColumns = parseInt(document.getElementById('settingGrid').value) || 4;
      renderGrid();
    };
    document.getElementById('settingRoomName').addEventListener('input', e => {
      roomNameEl.textContent = e.target.value || 'Мафия';
    });
  }

  function openPanel() {
    renderAdminPlayers();
    adminPanel.classList.remove('hidden');
    adminOverlay.classList.remove('hidden');
  }
  function closePanel() {
    adminPanel.classList.add('hidden');
    adminOverlay.classList.add('hidden');
  }

  function renderAdminPlayers() {
    const list = document.getElementById('adminPlayersList');
    list.innerHTML = '';
    for (let i = 0; i < activeSlots; i++) {
      const s = slots[i];
      const configured = !!(s.name || s.vdoUrl);
      const row = document.createElement('div');
      row.className = 'mf-player-row';

      const stateClass = configured ? `mf-player-row__state--${s.status}` : '';
      const roleClass  = s.role ? `mf-slot__role--${ROLE_CLASSES[s.role] || 'other'}` : '';

      row.innerHTML = `
        <span class="mf-player-row__num">${i+1}</span>
        <span class="mf-player-row__name">${s.name || '—'}</span>
        <span class="mf-player-row__role ${roleClass}">${s.role || ''}</span>
        <span class="mf-player-row__state ${stateClass}">${configured ? (STATUS_LABELS[s.status]||'') : ''}</span>
        <button class="mf-player-row__edit" data-idx="${i}">Изм.</button>
      `;
      row.querySelector('.mf-player-row__edit').addEventListener('click', () => {
        closePanel();
        setTimeout(() => openSlotEditor(i), 150);
      });
      list.appendChild(row);
    }
  }

  // ── Фазы ──────────────────────────────────────────────────────
  function setPhase(phase) {
    currentPhase = phase;
    const p = PHASES[phase];
    if (!p) return;

    phaseIcon.textContent = p.icon;
    phaseText.textContent  = p.text;

    // CSS класс на body
    Object.values(PHASES).forEach(ph => document.body.classList.remove(ph.css));
    document.body.classList.add(p.css);

    // Подсветка активной кнопки
    document.querySelectorAll('.mafia-phase-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.phase === phase);
    });

    // Рандомное событие при смене Ночь → День
    if (phase === 'day' && randomEventQueued) {
      randomEventQueued = false;
      document.getElementById('btnRandomEvent').classList.remove('mafia-btn--accent');
      setTimeout(triggerRandomEvent, 800);
    }
  }

  // ── Таймер ────────────────────────────────────────────────────
  function startTimer(sec) {
    stopTimer();
    let rem = sec;
    updateTimer(rem);
    timerInterval = setInterval(() => {
      rem--;
      updateTimer(rem);
      if (rem <= 0) {
        stopTimer();
        timerEl.classList.add('urgent');
        setTimeout(() => timerEl.classList.remove('urgent'), 3000);
        showToast('Время вышло!');
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerEl.textContent = '';
    timerEl.classList.remove('urgent');
  }

  function updateTimer(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2,'0')}`;
    timerEl.classList.toggle('urgent', sec <= 10 && sec > 0);
  }

  // ── Рандомное событие ─────────────────────────────────────────
  function toggleRandomEvent() {
    if (currentPhase !== 'night') {
      showToast('Только в фазе Ночь!', 'error'); return;
    }
    randomEventQueued = !randomEventQueued;
    const btn = document.getElementById('btnRandomEvent');
    btn.classList.toggle('mafia-btn--accent', randomEventQueued);
    showToast(randomEventQueued ? 'Рандомное событие запланировано!' : 'Событие отменено');
  }

  function triggerRandomEvent() {
    const alive = slots.slice(0, activeSlots)
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.status === 'alive' && (s.name || s.vdoUrl));

    if (!alive.length) { showToast('Нет живых игроков'); return; }

    // Перемешать
    for (let i = alive.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [alive[i], alive[j]] = [alive[j], alive[i]];
    }

    if (alive.length === 1) { applyKill(alive[0].i); return; }

    const survivor = alive[0];
    const victim   = alive[1];

    setTimeout(() => {
      showSlotMsg(survivor.i, '✅ ВЫЖИЛ ПРИ ОБСТРЕЛЕ!');
    }, 200);
    setTimeout(() => applyKill(victim.i), 1500);
  }

  function applyKill(idx) {
    if (Math.random() < 0.35) {
      showSlotMsg(idx, '💫 НА ГРАНИ СМЕРТИ, НО ВЫЖИЛ!');
    } else {
      slots[idx].status = 'dead';
      saveSlots();
      renderSlot(idx);
      renderAdminPlayers();
      showSlotMsg(idx, '💀 УБИТ!');
    }
  }

  function showSlotMsg(idx, text) {
    const el = grid.querySelector(`[data-idx="${idx}"]`);
    if (!el) return;
    const msg = document.createElement('div');
    msg.className = 'mf-slot__msg';
    msg.textContent = text;
    el.appendChild(msg);
    setTimeout(() => {
      msg.classList.add('fade-out');
      setTimeout(() => msg.remove(), 800);
    }, 5000);
  }

  // ── Сброс игры ────────────────────────────────────────────────
  function resetGame() {
    if (!confirm('Сбросить всю игру? Данные слотов будут удалены.')) return;
    slots = Array.from({ length: TOTAL_SLOTS }, defaultSlot);
    saveSlots();
    setPhase('wait');
    stopTimer();
    renderGrid();
    renderAdminPlayers();
    showToast('Игра сброшена');
  }

  // ── Хоткеи ────────────────────────────────────────────────────
  function setupHotkeys() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!document.getElementById('slotModal').classList.contains('open')) closePanel();
        else closeSlotModal();
      }
    });
  }

  // ── Storage ───────────────────────────────────────────────────
  function defaultSlot() {
    return { name: '', vdoUrl: '', role: '', status: 'extinct', votes: 0 };
  }

  function loadSlots() {
    try {
      const raw = localStorage.getItem('hlor_mafia_slots');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === TOTAL_SLOTS) return parsed;
      }
    } catch {}
    return Array.from({ length: TOTAL_SLOTS }, defaultSlot);
  }

  function saveSlots() {
    localStorage.setItem('hlor_mafia_slots', JSON.stringify(slots));
  }

  function applyStoredSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('hlor_mafia_settings') || '{}');
      if (s.activeSlots) { activeSlots = s.activeSlots; document.getElementById('settingSlots').value = activeSlots; }
      if (s.gridColumns) { gridColumns = s.gridColumns; document.getElementById('settingGrid').value = gridColumns; }
      if (s.roomName)    { roomNameEl.textContent = s.roomName; document.getElementById('settingRoomName').value = s.roomName; }
    } catch {}
  }

  // ── VDO.Ninja URL ─────────────────────────────────────────────
  function normalizeVdo(url) {
    url = url.trim();
    if (!url.startsWith('http')) {
      const id = url.replace(/[^a-zA-Z0-9_-]/g, '');
      return id ? `https://vdo.ninja/?view=${id}&cleanoutput&transparent` : '';
    }
    try {
      const u = new URL(url);
      if (u.searchParams.has('push') && !u.searchParams.has('view')) {
        u.searchParams.set('view', u.searchParams.get('push'));
        u.searchParams.delete('push');
      }
      if (!u.searchParams.has('cleanoutput')) u.searchParams.set('cleanoutput', '');
      return u.toString();
    } catch { return url; }
  }

  // ── Toast ─────────────────────────────────────────────────────
  function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ── Запуск ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
