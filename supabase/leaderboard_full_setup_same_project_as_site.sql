-- ═══════════════════════════════════════════════════════════════════════════
-- ВАЖНО: открой в Supabase ТОТ ЖЕ проект, что в js/supabase-client.js (URL ref в строке SUPABASE_URL).
-- Это один запуск «с нуля» для топа на сайте: user_lobby_history → leaderboard_public → RPC.
-- После выполнения: SELECT public.leaderboard_refresh_stats();
-- Потом подожди ~30 с и открой страницу топа (Ctrl+F5).
--
-- Если на этом проекте раньше уже ставили кривой топ — сначала один раз выполни
-- supabase/leaderboard_drop.sql в этом же проекте, потом этот файл целиком.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) История лобби (источник данных для пересборки топа) ─────────────────

CREATE TABLE IF NOT EXISTS public.user_lobby_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  lobby_id uuid,
  lobby_code text NOT NULL,
  game text NOT NULL DEFAULT 'mafia',
  room_name text,
  was_host boolean NOT NULL DEFAULT false,
  lobby_status_last text NOT NULL DEFAULT 'waiting',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT user_lobby_history_user_code UNIQUE (user_id, lobby_code)
);

COMMENT ON TABLE public.user_lobby_history IS 'История участия пользователя в лобби по коду комнаты';

CREATE INDEX IF NOT EXISTS idx_user_lobby_history_user_time
  ON public.user_lobby_history (user_id, last_seen_at DESC NULLS LAST);

ALTER TABLE public.user_lobby_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_lobby_history_select_own ON public.user_lobby_history;
DROP POLICY IF EXISTS user_lobby_history_insert_own ON public.user_lobby_history;
DROP POLICY IF EXISTS user_lobby_history_update_own ON public.user_lobby_history;
DROP POLICY IF EXISTS user_lobby_history_delete_own ON public.user_lobby_history;

CREATE POLICY user_lobby_history_select_own
  ON public.user_lobby_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_lobby_history_insert_own
  ON public.user_lobby_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_lobby_history_update_own
  ON public.user_lobby_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_lobby_history_delete_own
  ON public.user_lobby_history FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_lobby_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_lobby_history TO service_role;

-- ─── 1b) Закрытие лобби (status=ended) → записать хоста и всех из players[] в историю

CREATE OR REPLACE FUNCTION public.user_lobby_history_sync_on_lobby_ended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code_norm text;
  ins_game text;
  r record;
  pid text;
  puuid uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'ended' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  code_norm := upper(trim(NEW.code));
  ins_game := COALESCE(NULLIF(trim(lower(NEW.game)), ''), 'mafia');

  IF NEW.host_id IS NOT NULL THEN
    INSERT INTO public.user_lobby_history (
      user_id, lobby_id, lobby_code, game, room_name, was_host,
      lobby_status_last, first_seen_at, last_seen_at, finished_at
    ) VALUES (
      NEW.host_id, NEW.id, code_norm, ins_game, NEW.name, true,
      'ended', now(), now(), now()
    )
    ON CONFLICT (user_id, lobby_code) DO UPDATE SET
      lobby_id = COALESCE(EXCLUDED.lobby_id, user_lobby_history.lobby_id),
      game = EXCLUDED.game,
      room_name = COALESCE(NULLIF(EXCLUDED.room_name, ''), user_lobby_history.room_name),
      was_host = user_lobby_history.was_host OR EXCLUDED.was_host,
      lobby_status_last = 'ended',
      finished_at = COALESCE(user_lobby_history.finished_at, EXCLUDED.finished_at),
      last_seen_at = EXCLUDED.last_seen_at;
  END IF;

  FOR r IN
    SELECT elem FROM jsonb_array_elements(COALESCE(NEW.players, '[]'::jsonb)) AS t(elem)
  LOOP
    pid := r.elem->>'id';
    IF pid IS NULL OR pid !~ '^[0-9a-fA-F-]{36}$' THEN
      CONTINUE;
    END IF;
    puuid := pid::uuid;
    IF NEW.host_id IS NOT NULL AND puuid = NEW.host_id THEN
      CONTINUE;
    END IF;

    INSERT INTO public.user_lobby_history (
      user_id, lobby_id, lobby_code, game, room_name, was_host,
      lobby_status_last, first_seen_at, last_seen_at, finished_at
    ) VALUES (
      puuid, NEW.id, code_norm, ins_game, NEW.name, false,
      'ended', now(), now(), now()
    )
    ON CONFLICT (user_id, lobby_code) DO UPDATE SET
      lobby_id = COALESCE(EXCLUDED.lobby_id, user_lobby_history.lobby_id),
      game = EXCLUDED.game,
      room_name = COALESCE(NULLIF(EXCLUDED.room_name, ''), user_lobby_history.room_name),
      was_host = user_lobby_history.was_host OR EXCLUDED.was_host,
      lobby_status_last = 'ended',
      finished_at = COALESCE(user_lobby_history.finished_at, EXCLUDED.finished_at),
      last_seen_at = EXCLUDED.last_seen_at;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_lobby_history_on_lobby_ended ON public.lobbies;

CREATE TRIGGER trg_user_lobby_history_on_lobby_ended
  AFTER UPDATE OF status ON public.lobbies
  FOR EACH ROW
  WHEN (NEW.status = 'ended' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.user_lobby_history_sync_on_lobby_ended();

-- ─── 2) Кэш топа + функции + права под сайт (как leaderboard_schema.sql) ───

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

DROP POLICY IF EXISTS profiles_stats_counters_update_own ON public.profiles;
CREATE POLICY profiles_stats_counters_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS public.leaderboard_public (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nickname text NOT NULL,
  games_mafia int NOT NULL DEFAULT 0,
  games_whoami int NOT NULL DEFAULT 0,
  games_other int NOT NULL DEFAULT 0,
  completed_total int NOT NULL DEFAULT 0,
  visits_total int NOT NULL DEFAULT 0,
  play_seconds_estimate bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leaderboard_public IS 'Кэш топа из profiles.stat_*; пересборка leaderboard_refresh_stats()';

ALTER TABLE public.leaderboard_public ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leaderboard_public_select_all ON public.leaderboard_public;
CREATE POLICY leaderboard_public_select_all
  ON public.leaderboard_public FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.leaderboard_public TO anon, authenticated, service_role;

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
      AND (
        p.stat_sessions_completed > 0
        OR p.stat_mafia_opens > 0
        OR p.stat_whoami_opens > 0
        OR p.stat_play_seconds > 0
      )
    $dyn$,
    nick_sql
  );
END;
$$;

COMMENT ON FUNCTION public.leaderboard_refresh_stats() IS 'Перестроить leaderboard_public из profiles.stat_*';

REVOKE ALL ON FUNCTION public.leaderboard_refresh_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leaderboard_refresh_stats() TO service_role;

NOTIFY pgrst, 'reload schema';
