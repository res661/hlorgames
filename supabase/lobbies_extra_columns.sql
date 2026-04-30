-- Выполни в Supabase → SQL Editor.
-- Если таблицы lobbies ещё нет — сначала: supabase/lobbies_schema.sql
-- Если таблица уже есть — только эти ALTER:

alter table public.lobbies
  add column if not exists presenter_id uuid;

alter table public.lobbies
  add column if not exists mafia_chat jsonb not null default '[]'::jsonb;

alter table public.lobbies
  add column if not exists lobby_chat jsonb not null default '[]'::jsonb;

alter table public.lobbies
  add column if not exists host_plays boolean not null default false;

alter table public.lobbies
  alter column host_plays set default false;

comment on column public.lobbies.presenter_id is 'Игрок с правами ведущего в игре (панель фаз/слотов). NULL = ведёт хост комнаты (host_id).';
comment on column public.lobbies.mafia_chat is 'История чата mafia-play: [{kind, uid, text, ts, nick?}]';
comment on column public.lobbies.lobby_chat is 'История чата lobby.html: [{kind, uid, text, ts, nick?}]';
comment on column public.lobbies.host_plays is 'true: хост занимает +1 место в лобби вне основной сетки камер в мафии; false: только ведёт, без лишнего слота';

-- Опционально: индекс не обязателен (мало строк на лобби).
