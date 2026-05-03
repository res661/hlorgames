-- ============================================================================
-- Таблица lobbies — выполни в Supabase → SQL Editor, если ошибка
-- «relation public.lobbies does not exist»
-- ============================================================================

create table if not exists public.lobbies (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text,
  game          text not null,
  host_id       uuid not null references auth.users (id) on delete cascade,
  host_name     text,
  status        text not null default 'waiting',
  max_players   int not null default 8,
  password      text,
  players       jsonb not null default '[]'::jsonb, -- элементы: id, nickname, ready, slot, optional mafia_slot, joined_at (number ms — порядок слотов; отдельная колонка не нужна)
  presenter_id  uuid,
  mafia_chat    jsonb not null default '[]'::jsonb,
  lobby_chat    jsonb not null default '[]'::jsonb,
  host_plays    boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint lobbies_status_check check (status in ('waiting', 'active', 'ended'))
);

comment on table public.lobbies is 'Игровые лобби (мафия, бункер, алиас)';
comment on column public.lobbies.presenter_id is 'Ведущий в мафии; NULL — ведёт host_id';
comment on column public.lobbies.mafia_chat is 'История чата mafia-play';
comment on column public.lobbies.lobby_chat is 'История чата lobby.html';
comment on column public.lobbies.host_plays is '+1 место в лобби для хоста вне сетки камер';

create index if not exists idx_lobbies_code on public.lobbies (code);
create index if not exists idx_lobbies_game_status on public.lobbies (game, status);
create index if not exists idx_lobbies_host_id on public.lobbies (host_id);

-- ─── RLS (иначе клиент не видит строки) ───────────────────────────────────

alter table public.lobbies enable row level security;

-- Удалить старые политики с теми же именами, если перезапускаешь скрипт
drop policy if exists "lobbies_select_all" on public.lobbies;
drop policy if exists "lobbies_insert_host" on public.lobbies;
drop policy if exists "lobbies_update_authenticated" on public.lobbies;
drop policy if exists "lobbies_delete_host" on public.lobbies;

-- Список лобби и страница комнаты
create policy "lobbies_select_all"
  on public.lobbies for select
  to authenticated, anon
  using (true);

-- Создать комнату только от своего аккаунта
create policy "lobbies_insert_host"
  on public.lobbies for insert
  to authenticated
  with check (auth.uid() = host_id);

-- Вход в комнату обновляет players — поэтому разрешено всем залогиненным (MVP).
-- Позже можно сузить под выражение «только участники / хост».
create policy "lobbies_update_authenticated"
  on public.lobbies for update
  to authenticated
  using (true)
  with check (true);

-- Удалить свою комнату
create policy "lobbies_delete_host"
  on public.lobbies for delete
  to authenticated
  using (auth.uid() = host_id);

-- Удалить чужие лобби из админки: добавь политику вручную, когда есть public.profiles с role:
-- create policy "lobbies_delete_admin" on public.lobbies for delete to authenticated
-- using (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role in ('admin','superadmin')));

-- Чтобы клиенты получали postgres_changes без только опроса по таймеру, выполни:
-- supabase/enable_realtime_lobbies.sql (или Database → Publications → supabase_realtime → lobbies).
