-- Удалить из БД только то, что относится к топу (leaderboard v2 — leaderboard_public).
-- Выполни в Supabase → SQL Editor. Остальные таблицы (lobbies, profiles, user_lobby_history) не трогаются.

DROP FUNCTION IF EXISTS public.leaderboard_refresh_stats();

DROP TABLE IF EXISTS public.leaderboard_public CASCADE;

-- Старый топ (если оставался после прошлых экспериментов)
DROP TRIGGER IF EXISTS leaderboard_on_lobby_touch ON public.lobbies;
DROP FUNCTION IF EXISTS public.leaderboard_on_lobby_touch();
DROP FUNCTION IF EXISTS public.capture_leaderboard_snapshot(date);
DROP FUNCTION IF EXISTS public.leaderboard_get_stats();
DROP FUNCTION IF EXISTS public.leaderboard_get_snapshot_rank(date, text);
DROP TABLE IF EXISTS public.leaderboard_snapshot CASCADE;
DROP TABLE IF EXISTS public.leaderboard_stats CASCADE;

NOTIFY pgrst, 'reload schema';
