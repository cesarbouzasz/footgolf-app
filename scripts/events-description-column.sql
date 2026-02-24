-- Adds missing description column for events and refreshes PostgREST schema cache.

alter table public.events
  add column if not exists description text null;

select pg_notify('pgrst', 'reload schema');
