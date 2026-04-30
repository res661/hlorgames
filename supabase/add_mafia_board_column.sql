-- Состояние стола мафии для realtime-синхронизации (без ролей — только «публичные» поля).
-- Выполни в Supabase → SQL Editor один раз.
-- Роли по-прежнему только у клиента ведущего / владельца слота (не пишутся сюда).

alter table public.lobbies
  add column if not exists mafia_board jsonb not null default '{}'::jsonb;

comment on column public.lobbies.mafia_board is
  'Мафия play: { v:1, seq:int, phase?, activeSlots?, gridCols?, slots:[{name,vdoUrl,status,votes,linkedUserId}] }. seq монотонный; клиенты применяют только если seq вырос.';
