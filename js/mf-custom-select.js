/**
 * Кастомный dropdown для select — стиль сайта (лаймовая обводка, тёмное меню,
 * выделение «олива + лайм» как на игровых экранах HLOR).
 */
(function (global) {
  'use strict';

  function isProbablyEmojiGrapheme(gr) {
    if (!gr || gr.length > 8) return false;
    if (/^[\w—\-–.,«»"'°±/\s]+$/u.test(gr)) return false;
    try {
      return /\p{Extended_Pictographic}/u.test(gr);
    } catch (_) {
      return /[^\w\s.,—«»]/u.test(gr);
    }
  }

  /** Отделить ведущий графемный кластер (эмодзи) от подписи */
  function splitIconLabel(label) {
    const s = String(label || '').trim();
    if (!s) return { icon: '', text: '' };
    try {
      const seg = new Intl.Segmenter('ru', { granularity: 'grapheme' });
      const parts = [...seg.segment(s)];
      const first = parts[0]?.segment || '';
      const rest = s.slice(first.length).trimStart();
      if (first && rest.length > 0 && isProbablyEmojiGrapheme(first)) {
        return { icon: first, text: rest };
      }
    } catch (_) {}
    return { icon: '', text: s };
  }

  let docCloseBound = false;

  function closeAllMenus(exceptMenu) {
    document.querySelectorAll('.mf-dd__menu').forEach((menu) => {
      if (exceptMenu && menu === exceptMenu) return;
      menu.classList.remove('is-open');
      menu.hidden = true;
      const root = menu.closest('.mf-dd');
      const tr = root?.querySelector('.mf-dd__trigger');
      if (tr) tr.setAttribute('aria-expanded', 'false');
    });
  }

  function positionMenu(trigger, menu) {
    const r = trigger.getBoundingClientRect();
    const pad = 4;
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + pad)}px`;
    menu.style.minWidth = `${Math.round(r.width)}px`;
    const vw = window.innerWidth;
    const mw = menu.offsetWidth;
    if (r.left + mw > vw - 8) {
      menu.style.left = `${Math.max(8, Math.round(vw - mw - 8))}px`;
    }
    const mh = menu.offsetHeight;
    if (r.bottom + pad + mh > window.innerHeight - 8) {
      menu.style.top = `${Math.max(8, Math.round(r.top - pad - mh))}px`;
    }
  }

  function rebuild(root, native) {
    const trigger = root.querySelector('.mf-dd__trigger');
    const menu = root.querySelector('.mf-dd__menu');
    if (!trigger || !menu) return;

    const selIdx = native.selectedIndex >= 0 ? native.selectedIndex : 0;
    const opt = native.options[selIdx];
    const rawLabel = opt ? opt.textContent : '';
    const parts = splitIconLabel(rawLabel);

    trigger.innerHTML = '';
    const ic = document.createElement('span');
    ic.className = 'mf-dd__trigger-icon';
    ic.textContent = parts.icon || '';
    ic.hidden = !parts.icon;
    const lb = document.createElement('span');
    lb.className = 'mf-dd__trigger-label';
    lb.textContent = parts.text || rawLabel || '—';
    const ch = document.createElement('span');
    ch.className = 'mf-dd__trigger-chevron';
    ch.setAttribute('aria-hidden', 'true');
    ch.textContent = '▼';
    trigger.appendChild(ic);
    trigger.appendChild(lb);
    trigger.appendChild(ch);

    menu.innerHTML = '';
    for (let i = 0; i < native.options.length; i++) {
      const o = native.options[i];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mf-dd__item';
      if (i === selIdx) row.classList.add('is-selected');
      row.dataset.index = String(i);
      const ip = splitIconLabel(o.textContent);
      if (ip.icon) {
        const spanI = document.createElement('span');
        spanI.className = 'mf-dd__item-icon';
        spanI.textContent = ip.icon;
        row.appendChild(spanI);
      }
      const spanT = document.createElement('span');
      spanT.className = 'mf-dd__item-text';
      spanT.textContent = ip.text || o.textContent;
      row.appendChild(spanT);
      menu.appendChild(row);
    }

    const dis = !!native.disabled;
    root.classList.toggle('mf-dd--disabled', dis);
    trigger.disabled = dis;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function bindRoot(root, native) {
    const trigger = root.querySelector('.mf-dd__trigger');
    const menu = root.querySelector('.mf-dd__menu');
    if (!trigger || !menu || root.dataset.mfDdBound === '1') return;
    root.dataset.mfDdBound = '1';

    trigger.setAttribute('aria-haspopup', 'listbox');

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (native.disabled) return;
      const wasOpen = menu.classList.contains('is-open');
      closeAllMenus();
      if (wasOpen) return;
      rebuild(root, native);
      menu.hidden = false;
      menu.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => positionMenu(trigger, menu));
    });

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.mf-dd__item');
      if (!btn || native.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= native.options.length) return;
      native.selectedIndex = idx;
      native.dispatchEvent(new Event('change', { bubbles: true }));
      closeAllMenus();
      rebuild(root, native);
    });

    if (!docCloseBound) {
      docCloseBound = true;
      document.addEventListener(
        'click',
        () => {
          closeAllMenus();
        },
        false,
      );
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllMenus();
      });
      window.addEventListener('scroll', () => closeAllMenus(), true);
      window.addEventListener('resize', () => closeAllMenus());
    }
  }

  function mount(native) {
    if (!native || native.tagName !== 'SELECT') return null;
    let root = native.closest('.mf-dd');
    if (root) {
      rebuild(root, native);
      bindRoot(root, native);
      return root;
    }

    root = document.createElement('div');
    root.className = 'mf-dd';
    native.parentNode.insertBefore(root, native);
    root.appendChild(native);
    native.classList.add('mf-dd__native');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mf-dd__trigger';

    const menu = document.createElement('div');
    menu.className = 'mf-dd__menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');

    root.appendChild(trigger);
    root.appendChild(menu);

    rebuild(root, native);
    bindRoot(root, native);
    return root;
  }

  function refresh(native) {
    if (!native || native.tagName !== 'SELECT') return;
    mount(native);
  }

  function mountAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('select.mf-dd-select').forEach((sel) => mount(sel));
  }

  global.MafiaCustomSelect = {
    mount,
    refresh,
    mountAll,
    closeAll() {
      closeAllMenus();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
