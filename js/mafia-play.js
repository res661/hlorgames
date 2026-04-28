/**
 * MAFIA-PLAY.JS
 * Полная игровая страница Мафии с:
 *  - Ролями HOST / PLAYER
 *  - Realtime-чатом через Supabase Broadcast
 *  - Приватными сообщениями о ролях (только своему игроку)
 *  - Хост-слотом (ведущий не в сетке)
 *  - Управлением фазами, таймером, рандомными событиями
 *  - Горячей клавишей «admin» → суперадмин
 */

(function () {
  'use strict';

  // ── URL-параметры ────────────────────────────────────────────────────────────
  const params   = new URLSearchParams(window.location.search);
  const LOBBY    = params.get('code') || '';
  const IS_HOST  = params.get('role') === 'host';
  const MY_SLOT  = parseInt(params.get('slot') ?? '-1');  // 0-based, -1 = хост
  const CHANNEL  = `mafia:${LOBBY || 'local'}`;

  // ── Константы ────────────────────────────────────────────────────────────────
  const TOTAL     = 12;
  const ROLES_MAP = { 'Мафия':'mafia','Шериф':'sheriff','Доктор':'doctor','Маньяк':'maniac','Любовница':'other','Комиссар':'sheriff','Мирный':'civil' };
  const ROLES_INFO = {
    'Мирный':    'Найди мафию голосованием. Победа — исключить всех мафиози.',
    'Мафия':     'Ночью выбираете жертву. Победа — сравняться по числу с мирными.',
    'Шериф':     'Ночью проверяешь одного игрока. Узнаёшь — мирный или нет.',
    'Доктор':    'Ночью лечишь одного игрока. Можно спасти себя, но только раз.',
    'Маньяк':    'Действуешь один. Победа — остаться последним живым.',
    'Любовница': 'Ночью блокируешь одного игрока — он не может действовать.',
    'Комиссар':  'Можешь арестовать игрока ночью — он пропускает день.',
  };
  const STATUS_LBL = { alive:'ЖИВ', dead:'МЁРТВ', extinct:'ВЫБЫЛ' };
  const PHASES = {
    day:   { icon:'☀️', text:'ДЕНЬ — Обсуждение',       css:'ph-day'   },
    night: { icon:'🌙', text:'НОЧЬ — Мафия действует',  css:'ph-night' },
    vote:  { icon:'🗳️', text:'ГОЛОСОВАНИЕ',              css:'ph-vote'  },
    wait:  { icon:'⏳', text:'Ожидание игроков...',      css:'ph-wait'  },
  };

  // ── Состояние ────────────────────────────────────────────────────────────────
  let slots        = loadSlots();
  let activeSlots  = 12;
  let gridCols     = 4;
  let phase        = 'wait';
  let timerInt     = null;
  let randQueued   = false;
  let editIdx      = null;
  let chatOpen     = false;
  let hostOpen     = false;
  let unread       = 0;
  let rtChannel    = null;
  let myNickname   = 'Игрок';
  let myUserId     = null;

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const $grid      = () => document.getElementById('mafiaGrid');
  const $toast     = () => document.getElementById('toast');
  const $chat      = () => document.getElementById('chatMessages');
  const $timerEl   = () => document.getElementById('timerEl');

  // ── INIT ─────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    applySettings();
    renderGrid();
    setupRoleUI();
    setupSidebars();
    setupSlotModal();
    setupHostControls();
    setupChat();
    setupHotkeys();
    initRealtimeChat();
    addSysMsg('Добро пожаловать в игру!');
    if (IS_HOST) addSysMsg('Ты — ведущий. Назначай роли и управляй игрой через панель.');
  });

  // ── ROLE UI ──────────────────────────────────────────────────────────────────
  function setupRoleUI() {
    if (IS_HOST) {
      document.getElementById('hostBadge').classList.remove('hidden');
      document.getElementById('btnHostPanel').classList.remove('hidden');
    } else {
      if (MY_SLOT >= 0 && slots[MY_SLOT]?.role) showMyRole(slots[MY_SLOT].role);
    }
  }

  function showMyRole(role) {
    const wrap = document.getElementById('myRoleWrap');
    const val  = document.getElementById('myRoleVal');
    wrap.classList.remove('hidden');
    val.textContent = role;
    const cls = ROLES_MAP[role] || 'other';
    val.className = `mf-role-badge__val mf-slot__role--${cls}`;
  }

  // ── GRID ─────────────────────────────────────────────────────────────────────
  function renderGrid() {
    const g = $grid();
    g.innerHTML = '';
    g.style.gridTemplateColumns = `repeat(${gridCols},1fr)`;
    for (let i = 0; i < activeSlots; i++) g.appendChild(makeSlot(i));
  }

  function renderSlot(i) {
    const cur = $grid().querySelector(`[data-i="${i}"]`);
    if (cur) cur.replaceWith(makeSlot(i)); else renderGrid();
  }

  function makeSlot(i) {
    const s   = slots[i];
    const cfg = !!(s.name || s.vdoUrl);
    const div = document.createElement('div');
    div.className = 'mf-slot' + (cfg ? ` mf-slot--${s.status}` : '');
    div.dataset.i = i;

    // Номер
    const num = ce('div','mf-slot__num'); num.textContent = i+1; div.appendChild(num);

    // Кнопка редактирования (только хост)
    if (IS_HOST) {
      const eb = ce('button','mf-slot__edit'); eb.textContent = '✎';
      eb.addEventListener('click', e => { e.stopPropagation(); openSlotModal(i); });
      div.appendChild(eb);
    }

    // Видео / плейсхолдер
    if (s.vdoUrl && s.status !== 'extinct') {
      const iframe = document.createElement('iframe');
      iframe.className = 'mf-slot__video';
      iframe.src = vdoUrl(s.vdoUrl);
      iframe.allow = 'autoplay; camera; microphone; fullscreen';
      iframe.setAttribute('allowfullscreen','');
      div.appendChild(iframe);
    } else {
      const ph = ce('div','mf-slot__ph');
      ph.innerHTML = cfg && s.status === 'extinct'
        ? `<span class="mf-slot__ph-icon">🚫</span><span>ВЫБЫЛ</span>`
        : `<span class="mf-slot__ph-icon">📷</span><span>${esc(s.name) || `Слот ${i+1}`}</span>`;
      div.appendChild(ph);
    }

    // Нижний оверлей
    if (cfg) {
      const ov = ce('div','mf-slot__ov');
      const inf = ce('div','mf-slot__info');

      const nm = ce('div','mf-slot__name'); nm.textContent = s.name || `Слот ${i+1}`; inf.appendChild(nm);

      // Роль только хосту
      if (IS_HOST && s.role) {
        const rl = ce('div',`mf-slot__role mf-slot__role--${ROLES_MAP[s.role]||'other'}`);
        rl.textContent = s.role; inf.appendChild(rl);
      }

      const st = ce('div',`mf-slot__status mf-slot__status--${s.status}`);
      st.textContent = STATUS_LBL[s.status]||''; inf.appendChild(st);

      ov.appendChild(inf);

      // Голосование
      const votes = ce('div','mf-slot__votes');
      const minus = ce('button','mf-vote-btn'); minus.innerHTML = '−';
      const cnt   = ce('span','mf-vote-count');  cnt.textContent = s.votes||0;
      const plus  = ce('button','mf-vote-btn'); plus.innerHTML = '+';
      minus.addEventListener('click', e => { e.stopPropagation(); if(s.votes>0){s.votes--;cnt.textContent=s.votes;saveSlots();} });
      plus.addEventListener('click',  e => { e.stopPropagation(); s.votes++;cnt.textContent=s.votes;saveSlots(); });
      votes.append(minus, cnt, plus);
      ov.appendChild(votes);

      div.appendChild(ov);
    }

    if (IS_HOST) div.addEventListener('click', () => openSlotModal(i));
    return div;
  }

  // ── SLOT MODAL ───────────────────────────────────────────────────────────────
  function setupSlotModal() {
    document.getElementById('btnCloseSlot').onclick = closeSlotModal;
    document.getElementById('slotModal').addEventListener('click', e => {
      if (e.target === document.getElementById('slotModal')) closeSlotModal();
    });
    document.getElementById('btnSaveSlot').onclick  = saveSlot;
    document.getElementById('btnClearSlot').onclick = clearSlot;

    // Показываем чекбокс "отправить роль" когда роль выбрана
    document.getElementById('slotRole').addEventListener('change', () => {
      const hasRole = !!document.getElementById('slotRole').value;
      document.getElementById('sendRoleWrap').style.display = hasRole ? 'block' : 'none';
    });
  }

  function openSlotModal(i) {
    if (!IS_HOST) return;
    editIdx = i;
    const s = slots[i];
    document.getElementById('slotModalTitle').textContent = `Слот #${i+1}`;
    document.getElementById('slotName').value   = s.name   || '';
    document.getElementById('slotRole').value   = s.role   || '';
    document.getElementById('slotVdo').value    = s.vdoUrl || '';
    document.getElementById('slotStatus').value = s.status || 'alive';
    const hasRole = !!s.role;
    document.getElementById('sendRoleWrap').style.display = hasRole ? 'block' : 'none';
    document.getElementById('sendRoleCheck').checked = true;
    document.getElementById('slotModal').classList.add('open');
  }

  function closeSlotModal() {
    document.getElementById('slotModal').classList.remove('open');
    editIdx = null;
  }

  function saveSlot() {
    if (editIdx === null) return;
    const s = slots[editIdx];
    const oldRole = s.role;
    s.name   = document.getElementById('slotName').value.trim();
    s.role   = document.getElementById('slotRole').value;
    s.vdoUrl = document.getElementById('slotVdo').value.trim();
    s.status = document.getElementById('slotStatus').value;
    saveSlots();
    renderSlot(editIdx);
    renderHostPlayers();

    // Отправить роль в чат если выбрана и чекбокс включен
    const send = document.getElementById('sendRoleCheck').checked && s.role && s.role !== oldRole;
    if (send) sendRoleNotification(editIdx, s.role, s.name);

    closeSlotModal();
    toast(`Слот #${editIdx+1} сохранён`, 'success');

    // Broadcast обновление слота всем
    broadcastSlotUpdate(editIdx);
  }

  function clearSlot() {
    if (editIdx === null) return;
    slots[editIdx] = defSlot();
    saveSlots();
    renderSlot(editIdx);
    renderHostPlayers();
    closeSlotModal();
    toast(`Слот #${editIdx+1} очищен`);
    broadcastSlotUpdate(editIdx);
  }

  // ── SIDEBARS ─────────────────────────────────────────────────────────────────
  function setupSidebars() {
    document.getElementById('btnToggleChat').onclick = toggleChat;
    document.getElementById('btnCloseChat').onclick  = () => { chatOpen = false; updateSidebars(); };
    document.getElementById('btnHostPanel').onclick  = toggleHost;
    document.getElementById('btnCloseHost').onclick  = () => { hostOpen = false; updateSidebars(); };

    // Stabs
    document.querySelectorAll('.mf-stab').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.mf-stab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.mf-stab-panel').forEach(x => { x.classList.add('hidden'); x.classList.remove('active'); });
        b.classList.add('active');
        const panel = document.getElementById(`stab-${b.dataset.stab}`);
        if (panel) { panel.classList.remove('hidden'); panel.classList.add('active'); }
      });
    });
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    if (chatOpen) { hostOpen = false; unread = 0; updateChatBadge(); }
    updateSidebars();
    if (chatOpen) { renderHostPlayers(); scrollChat(); }
  }

  function toggleHost() {
    hostOpen = !hostOpen;
    if (hostOpen) { chatOpen = false; renderHostPlayers(); }
    updateSidebars();
  }

  function updateSidebars() {
    document.getElementById('chatSidebar').classList.toggle('hidden', !chatOpen);
    document.getElementById('hostSidebar').classList.toggle('hidden', !hostOpen);
    document.getElementById('btnToggleChat').classList.toggle('active', chatOpen);
    document.getElementById('btnHostPanel').classList.toggle('active', hostOpen);
  }

  // ── HOST CONTROLS ─────────────────────────────────────────────────────────────
  function setupHostControls() {
    // Фазы
    document.querySelectorAll('.mf-phase-btn').forEach(b => {
      b.addEventListener('click', () => setPhase(b.dataset.phase, true));
    });

    // Таймер
    document.getElementById('btnTimerStart').onclick = () => {
      const sec = parseInt(document.getElementById('timerSec').value) || 60;
      startTimer(sec, true);
    };
    document.getElementById('btnTimerStop').onclick = () => stopTimer(true);

    // Действия
    document.getElementById('btnResetVotes').onclick = () => {
      slots.forEach(s => s.votes = 0); saveSlots(); renderGrid();
      toast('Голоса сброшены');
      broadcast({ type:'reset_votes' });
    };
    document.getElementById('btnReviveAll').onclick = () => {
      slots.forEach(s => { if(s.status==='dead') s.status='alive'; });
      saveSlots(); renderGrid(); renderHostPlayers();
      toast('Все воскрешены','success');
      broadcast({ type:'revive_all' });
    };
    document.getElementById('btnResetGame').onclick = () => {
      if (!confirm('Сбросить игру?')) return;
      slots = Array.from({length:TOTAL}, defSlot);
      saveSlots(); setPhase('wait', true); stopTimer(true); renderGrid(); renderHostPlayers();
      toast('Игра сброшена');
    };
    document.getElementById('btnRandEvent').onclick = toggleRandEvent;

    // Настройки
    document.getElementById('btnApplySlots').onclick = () => {
      activeSlots = Math.max(1, Math.min(12, parseInt(document.getElementById('settingSlots').value)||12));
      renderGrid(); saveSettings({ activeSlots });
    };
    document.getElementById('btnApplyGrid').onclick = () => {
      gridCols = parseInt(document.getElementById('settingGrid').value)||4;
      renderGrid(); saveSettings({ gridCols });
    };
    document.getElementById('settingRoom').addEventListener('input', e => {
      document.getElementById('roomName').textContent = e.target.value || 'Мафия';
      saveSettings({ roomName: e.target.value });
    });
  }

  function renderHostPlayers() {
    const list = document.getElementById('hostPlayersList');
    if (!list) return;
    list.innerHTML = '';
    for (let i = 0; i < activeSlots; i++) {
      const s = slots[i];
      const cfg = !!(s.name||s.vdoUrl);
      const row = ce('div','mf-prow');
      const rc  = ROLES_MAP[s.role] || 'other';
      row.innerHTML = `
        <span class="mf-prow__num">${i+1}</span>
        <span class="mf-prow__name">${esc(s.name)||'—'}</span>
        <span class="mf-prow__role mf-slot__role--${rc}">${s.role||''}</span>
        <span class="mf-prow__state mf-prow__state--${s.status}">${cfg?(STATUS_LBL[s.status]||''):''}</span>
      `;
      row.addEventListener('click', () => { if(IS_HOST) openSlotModal(i); });
      list.appendChild(row);
    }
  }

  // ── PHASE ────────────────────────────────────────────────────────────────────
  function setPhase(p, broadcast_=false) {
    phase = p;
    const info = PHASES[p]; if (!info) return;
    document.getElementById('phaseIcon').textContent = info.icon;
    document.getElementById('phaseText').textContent = info.text;
    Object.values(PHASES).forEach(ph => document.body.classList.remove(ph.css));
    document.body.classList.add(info.css);
    document.querySelectorAll('.mf-phase-btn').forEach(b => b.classList.toggle('active', b.dataset.phase===p));
    addSysMsg(`Фаза: ${info.text}`);

    if (p === 'day' && randQueued) {
      randQueued = false;
      document.getElementById('btnRandEvent').classList.remove('mf-btn--blue');
      setTimeout(triggerRandEvent, 800);
    }
    if (broadcast_) broadcast({ type:'phase', phase:p });
  }

  // ── TIMER ────────────────────────────────────────────────────────────────────
  function startTimer(sec, broadcast_=false) {
    stopTimer();
    let rem = sec; updateTimer(rem);
    timerInt = setInterval(() => {
      rem--; updateTimer(rem);
      if (rem <= 0) { stopTimer(); toast('Время вышло!'); }
    }, 1000);
    if (broadcast_) broadcast({ type:'timer_start', seconds:sec });
  }
  function stopTimer(broadcast_=false) {
    if (timerInt) { clearInterval(timerInt); timerInt=null; }
    const el = $timerEl(); el.textContent=''; el.classList.remove('urgent');
    if (broadcast_) broadcast({ type:'timer_stop' });
  }
  function updateTimer(sec) {
    const el = $timerEl();
    const m = Math.floor(sec/60), s = sec%60;
    el.textContent = `${m}:${String(s).padStart(2,'0')}`;
    el.classList.toggle('urgent', sec<=10 && sec>0);
  }

  // ── RANDOM EVENT ──────────────────────────────────────────────────────────────
  function toggleRandEvent() {
    if (phase !== 'night') { toast('Только в фазе Ночь!','error'); return; }
    randQueued = !randQueued;
    document.getElementById('btnRandEvent').classList.toggle('mf-btn--blue', randQueued);
    toast(randQueued ? '🎲 Событие запланировано на утро!' : 'Событие отменено');
  }
  function triggerRandEvent() {
    const alive = slots.slice(0,activeSlots).map((s,i)=>({s,i})).filter(({s})=>s.status==='alive'&&(s.name||s.vdoUrl));
    if (!alive.length) { toast('Нет живых','error'); return; }
    for(let i=alive.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[alive[i],alive[j]]=[alive[j],alive[i]];}
    if (alive.length===1) { applyKill(alive[0].i); return; }
    setTimeout(()=>slotMsg(alive[0].i,'✅ ВЫЖИЛ ПРИ ОБСТРЕЛЕ!'),200);
    setTimeout(()=>applyKill(alive[1].i),1500);
  }
  function applyKill(i) {
    if (Math.random()<0.35) {
      slotMsg(i,'💫 СМЕРТЕЛЬНО РАНЕН, НО ВЫЖИЛ!');
    } else {
      slots[i].status='dead'; saveSlots(); renderSlot(i); renderHostPlayers();
      slotMsg(i,'💀 УБИТ!');
      broadcast({ type:'slot_update', idx:i, slot:slots[i] });
    }
  }
  function slotMsg(i, text) {
    const el = $grid().querySelector(`[data-i="${i}"]`); if (!el) return;
    const m = ce('div','mf-slot__msg'); m.textContent = text; el.appendChild(m);
    setTimeout(()=>{ m.classList.add('fade-out'); setTimeout(()=>m.remove(),800); },5000);
  }

  // ── CHAT ─────────────────────────────────────────────────────────────────────
  function setupChat() {
    const input = document.getElementById('chatInput');
    const send  = document.getElementById('btnChatSend');
    const go    = () => {
      const text = input.value.trim(); if (!text) return;
      const msg  = { type:'message', from: myNickname || 'Игрок', text, uid: myUserId };
      addChatMsg(msg, true);
      broadcast(msg);
      input.value = '';
    };
    send.onclick = go;
    input.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();go();} });
  }

  function addChatMsg(msg, isMine=false) {
    const wrap = $chat(); if (!wrap) return;
    const div  = ce('div', `mf-msg ${isMine?'mf-msg--mine':''}`);
    const time = new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
    div.innerHTML = `
      <div class="mf-msg__head">
        <span class="mf-msg__from">${esc(msg.from)}</span>
        <span class="mf-msg__time">${time}</span>
      </div>
      <div class="mf-msg__text">${esc(msg.text)}</div>
    `;
    wrap.appendChild(div);
    scrollChat();
    if (!chatOpen) { unread++; updateChatBadge(); }
  }

  function addSysMsg(text) {
    const wrap = $chat(); if (!wrap) return;
    const div = ce('div','mf-msg mf-msg--system');
    div.innerHTML = `
      <div class="mf-msg__head"><span class="mf-msg__from">Система</span></div>
      <div class="mf-msg__text">${esc(text)}</div>
    `;
    wrap.appendChild(div);
    scrollChat();
  }

  function addRoleCard(role, playerName) {
    const wrap = $chat(); if (!wrap) return;
    const info = ROLES_INFO[role] || 'Выполни свою задачу.';
    const cls  = ROLES_MAP[role] || 'other';
    const div  = ce('div','mf-msg mf-msg--private');
    div.innerHTML = `
      <div class="mf-msg__head">
        <span class="mf-msg__from">🎭 Роль назначена</span>
      </div>
      <div class="mf-role-card">
        <div class="mf-role-card__title">Твоя роль</div>
        <div class="mf-role-card__role mf-slot__role--${cls}">${role}</div>
        <div class="mf-role-card__desc">${info}</div>
      </div>
    `;
    wrap.appendChild(div);
    scrollChat();
    // Открываем чат чтобы игрок увидел роль
    chatOpen = true; updateSidebars(); updateChatBadge();
  }

  function scrollChat() {
    const w = $chat(); if (w) w.scrollTop = w.scrollHeight;
  }
  function updateChatBadge() {
    const b = document.getElementById('chatBadge');
    b.classList.toggle('hidden', unread === 0);
    b.textContent = unread;
  }

  // ── ROLE NOTIFICATION ────────────────────────────────────────────────────────
  function sendRoleNotification(slotIdx, role, playerName) {
    // Broadcast приватное сообщение — игрок сам фильтрует по своему slotIdx
    const msg = {
      type: 'role_assign',
      slot: slotIdx,
      role,
      playerName: playerName || `Слот ${slotIdx+1}`,
    };
    broadcast(msg);
    // В чат хоста — системное
    addSysMsg(`🎭 Роль "${role}" отправлена игроку ${playerName||`#${slotIdx+1}`}`);
  }

  // ── REALTIME ─────────────────────────────────────────────────────────────────
  function initRealtimeChat() {
    // Ждём supabase
    const tryInit = (n) => {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        connectChannel();
      } else if (n > 0) {
        setTimeout(() => tryInit(n-1), 500);
      }
    };
    tryInit(10);

    // Получаем текущего пользователя
    const waitUser = (n) => {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        supabaseClient.auth.getSession().then(({ data }) => {
          if (data?.session?.user) {
            myUserId   = data.session.user.id;
            myNickname = data.session.user.user_metadata?.nickname || 'Игрок';
          }
        });
      } else if (n > 0) {
        setTimeout(() => waitUser(n-1), 600);
      }
    };
    waitUser(8);
  }

  function connectChannel() {
    if (!supabaseClient) return;
    rtChannel = supabaseClient.channel(CHANNEL, { config: { broadcast: { self: false } } });
    rtChannel
      .on('broadcast', { event:'game' }, ({ payload }) => handlePayload(payload))
      .subscribe();
  }

  function broadcast(payload) {
    if (rtChannel) {
      rtChannel.send({ type:'broadcast', event:'game', payload });
    }
  }
  function broadcastSlotUpdate(i) {
    broadcast({ type:'slot_update', idx:i, slot:slots[i] });
  }

  function handlePayload(p) {
    if (!p || !p.type) return;
    switch (p.type) {
      case 'message':
        addChatMsg(p);
        break;
      case 'phase':
        setPhase(p.phase);
        break;
      case 'timer_start':
        startTimer(p.seconds);
        break;
      case 'timer_stop':
        stopTimer();
        break;
      case 'slot_update':
        if (p.slot && typeof p.idx === 'number') {
          slots[p.idx] = p.slot;
          saveSlots();
          renderSlot(p.idx);
          if (IS_HOST) renderHostPlayers();
        }
        break;
      case 'role_assign':
        // Принимаем только если это наш слот
        if (p.slot === MY_SLOT && !IS_HOST) {
          addRoleCard(p.role, p.playerName);
          showMyRole(p.role);
        }
        break;
      case 'reset_votes':
        slots.forEach(s => s.votes = 0); saveSlots(); renderGrid();
        break;
      case 'revive_all':
        slots.forEach(s => { if(s.status==='dead') s.status='alive'; });
        saveSlots(); renderGrid();
        break;
    }
  }

  // ── HOTKEYS ──────────────────────────────────────────────────────────────────
  function setupHotkeys() {
    // Секретный ввод «admin»
    let buf = '';
    document.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') { closeSlotModal(); }
      buf += e.key.toLowerCase();
      if (buf.length > 5) buf = buf.slice(-5);
      if (buf === 'admin') {
        buf = '';
        // Пробуем дать суперадмина через supabase если доступно
        if (typeof supabaseClient !== 'undefined' && supabaseClient && myUserId) {
          supabaseClient.from('profiles').update({ role:'superadmin' }).eq('id', myUserId)
            .then(({ error }) => {
              if (!error) toast('👑 Статус суперадмина получен!','success');
              else toast('Ошибка: ' + error.message,'error');
            });
        }
      }
    });
  }

  // ── STORAGE ──────────────────────────────────────────────────────────────────
  function defSlot() { return { name:'', vdoUrl:'', role:'', status:'extinct', votes:0 }; }
  function loadSlots() {
    try {
      const raw = localStorage.getItem('hlor_mafia_slots');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.length === TOTAL) return p;
      }
    } catch {}
    return Array.from({length:TOTAL}, defSlot);
  }
  function saveSlots() { localStorage.setItem('hlor_mafia_slots', JSON.stringify(slots)); }

  function applySettings() {
    try {
      const s = JSON.parse(localStorage.getItem('hlor_mafia_settings')||'{}');
      if (s.activeSlots) { activeSlots=s.activeSlots; document.getElementById('settingSlots').value=activeSlots; }
      if (s.gridCols)    { gridCols=s.gridCols;       document.getElementById('settingGrid').value=gridCols; }
      if (s.roomName)    { document.getElementById('roomName').textContent=s.roomName; document.getElementById('settingRoom').value=s.roomName; }
    } catch {}
  }
  function saveSettings(obj) {
    try {
      const cur = JSON.parse(localStorage.getItem('hlor_mafia_settings')||'{}');
      Object.assign(cur, obj);
      localStorage.setItem('hlor_mafia_settings', JSON.stringify(cur));
    } catch {}
  }

  // ── VDO.NINJA ────────────────────────────────────────────────────────────────
  function vdoUrl(url) {
    url = url.trim();
    if (!url.startsWith('http')) {
      const id = url.replace(/[^a-zA-Z0-9_-]/g,'');
      return id ? `https://vdo.ninja/?view=${id}&cleanoutput&transparent` : '';
    }
    try {
      const u = new URL(url);
      if (u.searchParams.has('push')&&!u.searchParams.has('view')) {
        u.searchParams.set('view',u.searchParams.get('push')); u.searchParams.delete('push');
      }
      if (!u.searchParams.has('cleanoutput')) u.searchParams.set('cleanoutput','');
      return u.toString();
    } catch { return url; }
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  function ce(tag, cls) { const el = document.createElement(tag); el.className = cls; return el; }
  function esc(str) { return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function toast(msg, type='') {
    const t = $toast(); if (!t) return;
    t.textContent = msg; t.className = `toast show ${type}`;
    clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove('show'), 2800);
  }

})();
