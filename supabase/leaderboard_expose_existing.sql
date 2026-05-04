-- Таблица leaderboard_public уже есть, но сайт даёт 404 / «Could not find ... schema cache».
-- Перед SQL:
--   • Table Editor → leaderboard_public → включи доступ к Data API (убери «Not exposed»).
--   • Settings → Data API → схема public в списке.
-- Выполни ниже в SQL Editor этого проекта; строка NOTIFY перезагружает кэш PostgREST.

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

COMMENT ON FUNCTION public.hlor_leaderboard_list(integer) IS 'HLOR leaderboard: read cache for REST RPC';

NOTIFY pgrst, 'reload schema';
