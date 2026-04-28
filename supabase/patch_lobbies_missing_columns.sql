-- Выполни в Supabase → SQL Editor (если ошибка про host_plays / schema cache)
-- Потом: Dashboard → Settings → API → «Reload» / или подожди 1–2 мин.

alter table public.lobbies
  add column if not exists presenter_id uuid;

alter table public.lobbies
  add column if not exists mafia_chat jsonb not null default '[]'::jsonb;

alter table public.lobbies
  add column if not exists lobby_chat jsonb not null default '[]'::jsonb;

alter table public.lobbies
  add column if not exists host_plays boolean not null default true;

-- Обновить кэш схемы PostgREST (часто убирает "Could not find column in schema cache")
notify pgrst, 'reload schema';
