-- ============================================================================
-- Realtime (Postgres Changes) для lobbies
--
-- На стороне приложения уже есть channel + postgres_changes на public.lobbies
-- (js/lobby.js, js/game.js, js/mafia-play.js, js/lobby-indicator.js).
-- Без этого шага Postgres не шлёт события — подписка получает CHANNEL_ERROR.
--
-- Как включить (любой один способ):
--
--   A) Dashboard: проект Supabase → Database → Publications → строка
--      «supabase_realtime» → включи переключатель у таблицы lobbies.
--
--   B) SQL Editor: вставь этот файл целиком и нажми Run.
--
-- Документация: https://supabase.com/docs/guides/realtime/postgres-changes
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lobbies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lobbies;
  END IF;
END $$;
