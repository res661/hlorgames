/**
 * SUPABASE CLIENT
 */

const SUPABASE_URL = 'https://mkkwzqbvzvuvuvbskcmt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ra3d6cWJ2enZ1dnV2YnNrY210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTQwNjgsImV4cCI6MjA5Mjg3MDA2OH0.8DlW-Vwv9IulHe_1wDbOql59R27axKZBmFRm9qbCd7Y';

const isDemoMode = SUPABASE_URL.includes('ТВОЙ_ПРОЕКТ') || !SUPABASE_KEY || SUPABASE_KEY.length < 10;

let supabase = null;

function initSupabase() {
  if (isDemoMode) {
    console.warn('[Supabase] Demo режим — ключи не заполнены');
    return;
  }

  // Ждём пока CDN загрузит библиотеку
  const tryInit = (attempts) => {
    if (attempts <= 0) {
      console.error('[Supabase] Библиотека не загрузилась за 5 секунд');
      return;
    }

    const lib = window.supabase || window.supabaseJs;
    if (!lib || typeof lib.createClient !== 'function') {
      console.warn('[Supabase] Библиотека ещё не готова, повтор...');
      setTimeout(() => tryInit(attempts - 1), 500);
      return;
    }

    try {
      supabase = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('[Supabase] ✅ Подключено');

      // Проверяем соединение
      supabase.from('profiles').select('id').limit(1)
        .then(({ error }) => {
          if (error) {
            console.warn('[Supabase] Проверка таблицы profiles:', error.message);
          } else {
            console.log('[Supabase] ✅ Таблица profiles доступна');
          }
        });
    } catch (e) {
      console.error('[Supabase] Ошибка createClient:', e);
    }
  };

  tryInit(10);
}

function requireSupabase(errEl) {
  if (!supabase) {
    const msg = 'Supabase не подключён. Проверь консоль (F12).';
    if (errEl) errEl.textContent = msg;
    console.error('[Supabase] requireSupabase: supabase = null');
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', initSupabase);
