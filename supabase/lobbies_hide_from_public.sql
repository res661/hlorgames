-- Скрытые из каталога лобби: не в списках «Активные» / «Недавние» на game.html,
-- вход по коду и ссылке без изменений. Статистика и логика игры — как у обычных.
-- Выполни в Supabase → SQL Editor.

alter table public.lobbies
  add column if not exists hide_from_public boolean not null default false;

comment on column public.lobbies.hide_from_public is
  'true — не показывать в публичных списках лобби на сайте; создатель и гости заходят по коду/URL.';
