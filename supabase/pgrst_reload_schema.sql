-- Принудительно обновить кэш схемы PostgREST (Supabase REST API).
-- Выполни в SQL Editor, если браузер пишет: «Could not find the table … in the schema cache».

NOTIFY pgrst, 'reload schema';
