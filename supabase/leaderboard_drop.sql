-- Удалить из БД только то, что относилось к топу (leaderboard).
-- Выполни в Supabase → SQL Editor в том же проекте. Остальные таблицы (lobbies, profiles и т.д.) не трогаются.

-- 1) Триггер на лобби
drop trigger if exists leaderboard_on_lobby_touch on public.lobbies;

-- 2) Функции (сигнатуры как при создании)
drop function if exists public.leaderboard_on_lobby_touch();
drop function if exists public.capture_leaderboard_snapshot(date);
drop function if exists public.leaderboard_get_stats();
drop function if exists public.leaderboard_get_snapshot_rank(date, text);

-- 3) Таблицы (RLS и политики удалятся вместе с таблицей)
drop table if exists public.leaderboard_snapshot cascade;
drop table if exists public.leaderboard_stats cascade;

-- 4) Обновить кэш PostgREST
notify pgrst, 'reload schema';
