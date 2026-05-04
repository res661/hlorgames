-- Шаг 0 — только проверка (Supabase → SQL Editor → Run)
-- Если table_ok = NULL — таблицы нет, нужно снова выполнить leaderboard_schema.sql целиком.

SELECT to_regclass('public.leaderboard_public') AS table_ok;

-- Если table_ok уже не NULL — увидеть число строк (может быть 0 до первого refresh):

SELECT count(*)::bigint AS row_count FROM public.leaderboard_public;
