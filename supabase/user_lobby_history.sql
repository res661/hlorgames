-- История комнат для профиля. Выполни в Supabase → SQL Editor.
-- Отдельно от игровой логики: клиент пишет визит и статус закрытия.

create table if not exists public.user_lobby_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- FK на lobbies намеренно без ссылки: иначе CREATE падает, если lobbies ещё нет,
  -- и тогда история профиля не создаётся вообще. Код клиента не требует FK.
  lobby_id uuid,
  lobby_code text not null,
  game text not null default 'mafia',
  room_name text,
  was_host boolean not null default false,
  lobby_status_last text not null default 'waiting',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint user_lobby_history_user_code unique (user_id, lobby_code)
);

comment on table public.user_lobby_history is 'История участия пользователя в лобби по коду комнаты';

create index if not exists idx_user_lobby_history_user_time
  on public.user_lobby_history (user_id, last_seen_at desc nulls last);

alter table public.user_lobby_history enable row level security;

drop policy if exists user_lobby_history_select_own on public.user_lobby_history;
drop policy if exists user_lobby_history_insert_own on public.user_lobby_history;
drop policy if exists user_lobby_history_update_own on public.user_lobby_history;
drop policy if exists user_lobby_history_delete_own on public.user_lobby_history;

create policy user_lobby_history_select_own
  on public.user_lobby_history for select to authenticated
  using (auth.uid() = user_id);

create policy user_lobby_history_insert_own
  on public.user_lobby_history for insert to authenticated
  with check (auth.uid() = user_id);

create policy user_lobby_history_update_own
  on public.user_lobby_history for update to authenticated
  using (auth.uid() = user_id);

create policy user_lobby_history_delete_own
  on public.user_lobby_history for delete to authenticated
  using (auth.uid() = user_id);

-- Права для API (anon/authenticated через PostgREST). Без них иногда ошибка как «нет таблицы».
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table public.user_lobby_history to authenticated;
grant select, insert, update, delete on table public.user_lobby_history to service_role;

-- Обновить кэш схемы PostgREST сразу после создания таблицы
notify pgrst, 'reload schema';

-- Проверка: в Table Editor должна появиться таблица user_lobby_history.
-- При ошибке из сайта выполни здесь же:
--   select tablename from pg_tables where schemaname='public' and tablename='user_lobby_history';