-- При переводе лобби в status = 'ended' записывает/обновляет строки в user_lobby_history
-- для хоста и всех id из lobbies.players[]. Так завершение считается всем участникам,
-- даже если у кого-то закрыт браузер и клиент не вызвал markLobbyHistoryFinished.
-- Требует существующих таблиц public.lobbies и public.user_lobby_history.

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
      user_id,
      lobby_id,
      lobby_code,
      game,
      room_name,
      was_host,
      lobby_status_last,
      first_seen_at,
      last_seen_at,
      finished_at
    ) VALUES (
      NEW.host_id,
      NEW.id,
      code_norm,
      ins_game,
      NEW.name,
      true,
      'ended',
      now(),
      now(),
      now()
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
    SELECT elem
    FROM jsonb_array_elements(COALESCE(NEW.players, '[]'::jsonb)) AS t(elem)
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
      user_id,
      lobby_id,
      lobby_code,
      game,
      room_name,
      was_host,
      lobby_status_last,
      first_seen_at,
      last_seen_at,
      finished_at
    ) VALUES (
      puuid,
      NEW.id,
      code_norm,
      ins_game,
      NEW.name,
      false,
      'ended',
      now(),
      now(),
      now()
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

COMMENT ON FUNCTION public.user_lobby_history_sync_on_lobby_ended() IS 'Запись user_lobby_history при закрытии лобби (хост + игроки из JSON)';

NOTIFY pgrst, 'reload schema';
