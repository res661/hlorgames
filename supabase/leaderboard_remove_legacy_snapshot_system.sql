-- Убрать старую систему топа: leaderboard_stats + leaderboard_snapshot + триггер на lobbies.
-- Текущий сайт читает только leaderboard_public / hlor_leaderboard_list (из user_lobby_history).
-- Не трогает: leaderboard_public, leaderboard_refresh_stats, hlor_leaderboard_list, user_lobby_history.

DROP TRIGGER IF EXISTS leaderboard_on_lobby_touch ON public.lobbies;

DROP FUNCTION IF EXISTS public.leaderboard_on_lobby_touch();

DROP FUNCTION IF EXISTS public.capture_leaderboard_snapshot(date);

DROP FUNCTION IF EXISTS public.leaderboard_get_stats();

DROP FUNCTION IF EXISTS public.leaderboard_get_snapshot_rank(date, text);

DROP TABLE IF EXISTS public.leaderboard_snapshot CASCADE;

DROP TABLE IF EXISTS public.leaderboard_stats CASCADE;

NOTIFY pgrst, 'reload schema';
