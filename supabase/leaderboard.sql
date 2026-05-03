-- Топ игроков: счётчики + ежедневные снимки для столбца «± место».
-- Выполни в том же проекте Supabase, где public.lobbies и public.profiles.
-- После любого DDL: NOTIFY pgrst, 'reload schema'; (или подожди минуту)

-- ─── Накопительная статистика (обновляет только триггер, не клиенты) ────────

create table if not exists public.leaderboard_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lobbies_created int not null default 0,
  games_hosted_ended int not null default 0,
  games_played_ended int not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.leaderboard_stats is 'Агрегаты для топа: создания лобби, завершённые как хост, завершённые как участник';

-- ─── Ежесуточный снимок рангов (для +/- к вчера) ─────────────────────────────

create table if not exists public.leaderboard_snapshot (
  id bigserial primary key,
  snapshot_at date not null,
  category text not null check (category in ('lobbies_created', 'hosted_ended', 'played_ended')),
  user_id uuid not null references auth.users (id) on delete cascade,
  rank int not null,
  value int not null,
  nickname text,
  constraint leaderboard_snapshot_unique unique (snapshot_at, category, user_id)
);

create index if not exists idx_leaderboard_snapshot_day_cat
  on public.leaderboard_snapshot (snapshot_at desc, category);

comment on table public.leaderboard_snapshot is 'Снимки рангов раз в день — запускай capture_leaderboard_snapshot() по cron';

-- ─── Триггер на лобби ────────────────────────────────────────────────────────

create or replace function public.leaderboard_on_lobby_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.host_id is not null then
      insert into public.leaderboard_stats as s (user_id, lobbies_created)
      values (new.host_id, 1)
      on conflict (user_id) do update set
        lobbies_created = s.lobbies_created + 1,
        updated_at = now();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is distinct from 'ended'
     and new.status = 'ended'
     and new.host_id is not null
  then
    insert into public.leaderboard_stats as s (user_id, games_hosted_ended)
    values (new.host_id, 1)
    on conflict (user_id) do update set
      games_hosted_ended = s.games_hosted_ended + 1,
      updated_at = now();

    insert into public.leaderboard_stats as s (user_id, games_played_ended)
    select distinct x.uid, 1
    from (
      select (elem ->> 'id')::uuid as uid
      from jsonb_array_elements(coalesce(new.players::jsonb, '[]'::jsonb)) as elem
      where (elem ->> 'id') is not null
        and (elem ->> 'id') ~* '^[0-9a-f-]{36}$'
      union
      select new.host_id::uuid
    ) as x
    where x.uid is not null
    on conflict (user_id) do update set
      games_played_ended = s.games_played_ended + excluded.games_played_ended,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists leaderboard_on_lobby_touch on public.lobbies;
create trigger leaderboard_on_lobby_touch
  after insert or update of status, players on public.lobbies
  for each row
  execute function public.leaderboard_on_lobby_touch();
-- Если Postgres ругается на EXECUTE FUNCTION — замени на: EXECUTE PROCEDURE public.leaderboard_on_lobby_touch();

-- ─── Снимок за выбранный UTC-день (удобно ставить pg_cron на 00:05 UTC) ────

create or replace function public.capture_leaderboard_snapshot(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.leaderboard_snapshot where snapshot_at = p_day;

  insert into public.leaderboard_snapshot (snapshot_at, category, user_id, rank, value, nickname)
  select p_day, 'lobbies_created', q.user_id, q.rnk, q.val, q.nickname
  from (
    select
      lbs.user_id,
      row_number() over (
        order by lbs.lobbies_created desc nulls last, lbs.updated_at asc, lbs.user_id asc
      ) as rnk,
      lbs.lobbies_created::int as val,
      (select pf.nickname from public.profiles pf where pf.id = lbs.user_id limit 1) as nickname
    from public.leaderboard_stats lbs
    where lbs.lobbies_created > 0
  ) q;

  insert into public.leaderboard_snapshot (snapshot_at, category, user_id, rank, value, nickname)
  select p_day, 'hosted_ended', q.user_id, q.rnk, q.val, q.nickname
  from (
    select
      lbs.user_id,
      row_number() over (
        order by lbs.games_hosted_ended desc nulls last, lbs.updated_at asc, lbs.user_id asc
      ) as rnk,
      lbs.games_hosted_ended::int as val,
      (select pf.nickname from public.profiles pf where pf.id = lbs.user_id limit 1) as nickname
    from public.leaderboard_stats lbs
    where lbs.games_hosted_ended > 0
  ) q;

  insert into public.leaderboard_snapshot (snapshot_at, category, user_id, rank, value, nickname)
  select p_day, 'played_ended', q.user_id, q.rnk, q.val, q.nickname
  from (
    select
      lbs.user_id,
      row_number() over (
        order by lbs.games_played_ended desc nulls last, lbs.updated_at asc, lbs.user_id asc
      ) as rnk,
      lbs.games_played_ended::int as val,
      (select pf.nickname from public.profiles pf where pf.id = lbs.user_id limit 1) as nickname
    from public.leaderboard_stats lbs
    where lbs.games_played_ended > 0
  ) q;
end;
$$;

-- RLS --------------------------------------------------------------------------

alter table public.leaderboard_stats enable row level security;
alter table public.leaderboard_snapshot enable row level security;

drop policy if exists leaderboard_stats_read on public.leaderboard_stats;
create policy leaderboard_stats_read
  on public.leaderboard_stats for select
  to anon, authenticated
  using (true);

drop policy if exists leaderboard_snapshot_read on public.leaderboard_snapshot;
create policy leaderboard_snapshot_read
  on public.leaderboard_snapshot for select
  to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated;
grant select on table public.leaderboard_stats to anon, authenticated;
grant select on table public.leaderboard_snapshot to anon, authenticated;

notify pgrst, 'reload schema';
