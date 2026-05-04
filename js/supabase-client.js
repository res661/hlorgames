/**
 * SUPABASE CLIENT
 * supabaseClient — наш клиент подключения к БД
 *
 * URL и anon key возьми в Supabase → Project Settings → Data API (бывш. API).
 * Они должны быть от того же проекта, где выполнен leaderboard_schema.sql —
 * иначе топ даёт 404 / «schema cache», хотя в другом проекте данные есть.
 */

const SUPABASE_URL = 'https://mkkwzqbvzvuvuvbskcmt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ra3d6cWJ2enZ1dnV2YnNrY210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTQwNjgsImV4cCI6MjA5Mjg3MDA2OH0.8DlW-Vwv9IulHe_1wDbOql59R27axKZBmFRm9qbCd7Y';

const isDemoMode = false;

// Используем другое имя чтобы не конфликтовать с window.supabase (CDN библиотека)
var supabaseClient = null;

function initSupabase() {
  try {
    // window.supabase — это сама библиотека из CDN
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[Supabase] ✅ Подключено');
  } catch (e) {
    console.error('[Supabase] Ошибка подключения:', e);
  }
}

function requireSupabase(errEl) {
  if (!supabaseClient) {
    const msg = 'Ошибка подключения к базе данных';
    if (errEl) errEl.textContent = msg;
    console.error('[Supabase] supabaseClient = null');
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', initSupabase);
