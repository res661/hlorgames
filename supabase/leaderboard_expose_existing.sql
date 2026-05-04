-- Таблица leaderboard_public уже есть, но сайт даёт 404 / schema cache.
-- Выполни в этом же проекте (SQL Editor), затем NOTIFY и обнови страницу.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON TABLE public.leaderboard_public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hlor_leaderboard_list(p_limit int DEFAULT 500)
RETURNS SETOF public.leaderboard_public
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.leaderboard_public
  ORDER BY completed_total DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 500);
$$;

REVOKE ALL ON FUNCTION public.hlor_leaderboard_list(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hlor_leaderboard_list(integer) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
