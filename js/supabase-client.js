/**
 * SUPABASE CLIENT
 * 
 * Сюда вставляешь свои ключи из Supabase Dashboard:
 * Settings → API → Project URL и anon public key
 * 
 * ВАЖНО: эти ключи публичные (anon key) — их безопасно хранить в коде.
 * Никогда не вставляй сюда service_role key!
 */

const SUPABASE_URL  = 'https://mkkwzqbvzvuvuvbskcmt.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_JOqfy2zW-hNVV3jPiBYhpw_FYeknfpM';

// Подключаем Supabase через CDN (загружается в index.html)
// Если ключи не заменены — работаем в demo-режиме
const isDemoMode = SUPABASE_URL.includes('ТВОЙ_ПРОЕКТ');

let supabase = null;

function initSupabase() {
  if (isDemoMode) {
    console.warn('[Supabase] Demo режим. Замените ключи в js/supabase-client.js');
    return;
  }
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[Supabase] Подключено успешно');
  } catch (e) {
    console.error('[Supabase] Ошибка подключения:', e);
  }
}

// Хелпер — проверить, есть ли подключение
function requireSupabase() {
  if (!supabase) {
    showToast('База данных не подключена. Настройте Supabase.', 'error');
    return false;
  }
  return true;
}

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', initSupabase);
