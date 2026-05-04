-- ═══════════════════════════════════════════════════════════════════════════
-- HLOR — публичный топ из счётчиков профиля (profiles.stat_*), те же что в интерфейсе профиля.
-- Выполни целиком в Supabase → SQL Editor (одним скриптом).
-- После запуска: SELECT public.leaderboard_refresh_stats();
-- Таблица leaderboard_public не обновляется сама — cron или ручной leaderboard_refresh_stats().
--
-- Если в браузере 404 или «schema cache»:
-- 1) Table Editor → таблица leaderboard_public → включи доступ к Data API (бейдж
--    «Not exposed» / настройки таблицы — «Expose to Data API»), если есть.
-- 2) Выполни NOTIFY внизу файла или supabase/pgrst_reload_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Опционально: участие в топе (профиль уже есть у проекта; колонку добавляем мягко)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_on_leaderboard boolean NOT NULL DEFAULT true;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stat_mafia_opens int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_whoami_opens int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_sessions_completed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stat_play_seconds bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.leaderboard_public (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nickname text NOT NULL,
  games_mafia int NOT NULL DEFAULT 0,
  games_whoami int NOT NULL DEFAULT 0,
  games_other int NOT NULL DEFAULT 0,
  completed_total int NOT NULL DEFAULT 0,
  visits_total int NOT NULL DEFAULT 0,
  -- Совпадает со stat_play_seconds в профиле (сумма времени за столами из браузера)
  play_seconds_estimate bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leaderboard_public IS 'Кэш топа; leaderboard_refresh_stats() копирует profiles.stat_*';

DROP POLICY IF EXISTS profiles_stats_counters_update_own ON public.profiles;
CREATE POLICY profiles_stats_counters_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

ALTER TABLE public.leaderboard_public ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_public_select_all ON public.leaderboard_public;
CREATE POLICY leaderboard_public_select_all
  ON public.leaderboard_public FOR SELECT TO anon, authenticated
  USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON public.leaderboard_public TO anon, authenticated, service_role;

-- Если прямой GET /leaderboard_public даёт 404, клиент читает топ через этот RPC
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

-- Пересборка из profiles.stat_* (те же числа, что синхронизирует клиент с профилем).
CREATE OR REPLACE FUNCTION public.leaderboard_refresh_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nick_col text;
  nick_sql text;
BEGIN
  DELETE FROM public.leaderboard_public;

  SELECT c.column_name
  INTO nick_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'profiles'
    AND c.column_name = ANY (
      ARRAY['nickname', 'username', 'display_name', 'full_name']::text[]
    )
  ORDER BY
    CASE c.column_name
      WHEN 'nickname' THEN 1
      WHEN 'username' THEN 2
      WHEN 'display_name' THEN 3
      WHEN 'full_name' THEN 4
    END
  LIMIT 1;

  IF nick_col IS NOT NULL THEN
    nick_sql := format(
      'COALESCE(NULLIF(trim(p.%I::text), ''''), NULLIF(trim(split_part(coalesce(u.email::text, ''''), ''@'', 1)), ''''), ''Игрок #'' || left(replace(p.id::text, ''-'', ''''), 6))',
      nick_col
    );
  ELSE
    nick_sql :=
      'COALESCE(NULLIF(trim(split_part(coalesce(u.email::text, ''''), ''@'', 1)), ''''), ''Игрок #'' || left(replace(p.id::text, ''-'', ''''), 6))';
  END IF;

  EXECUTE format(
    $dyn$
    INSERT INTO public.leaderboard_public (
      user_id,
      nickname,
      games_mafia,
      games_whoami,
      games_other,
      completed_total,
      visits_total,
      play_seconds_estimate,
      refreshed_at
    )
    SELECT
      p.id,
      (%s) AS nickname,
      p.stat_mafia_opens::int,
      p.stat_whoami_opens::int,
      0::int,
      p.stat_sessions_completed::int,
      (p.stat_mafia_opens + p.stat_whoami_opens)::int,
      p.stat_play_seconds::bigint,
      now()
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE COALESCE(p.show_on_leaderboard, true) = true
    $dyn$,
    nick_sql
  );
END;
$$;

COMMENT ON FUNCTION public.leaderboard_refresh_stats() IS 'Перестроить leaderboard_public: один аккаунт — одна строка (profiles), счётчики stat_*';

REVOKE ALL ON FUNCTION public.leaderboard_refresh_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leaderboard_refresh_stats() TO service_role;

-- Расписание (если включён pg_cron): раз в 30 минут — раскомментируй после create extension pg_cron
-- SELECT cron.schedule('hlor_leaderboard_refresh', '*/30 * * * *', 'SELECT public.leaderboard_refresh_stats()');

-- Обновить кэш схемы PostgREST (иначе API не видит новую таблицу несколько секунд/минут)
NOTIFY pgrst, 'reload schema';
