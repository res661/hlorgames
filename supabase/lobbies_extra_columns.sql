-- Выполни в Supabase → SQL Editor (один раз).
-- Расширяет таблицу public.lobbies под чат и отдельного ведущего в мафии.

alter table public.lobbies
  add column if not exists presenter_id uuid;

alter table public.lobbies
  add column if not exists mafia_chat jsonb not null default '[]'::jsonb;

alter table public.lobbies
  add column if not exists lobby_chat jsonb not null default '[]'::jsonb;

comment on column public.lobbies.presenter_id is 'Игрок с правами ведущего в игре (панель фаз/слотов). NULL = ведёт хост комнаты (host_id).';
comment on column public.lobbies.mafia_chat is 'История чата mafia-play: [{kind, uid, text, ts, nick?}]';
comment on column public.lobbies.lobby_chat is 'История чата lobby.html: [{kind, uid, text, ts, nick?}]';

-- Опционально: индекс не обязателен (мало строк на лобби).
