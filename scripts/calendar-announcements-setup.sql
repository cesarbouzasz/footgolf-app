-- Calendar announcements: manual date markers per association
-- Used by: /admin/calendario (admins) and /events/calendar (members)

create table if not exists public.calendar_announcements (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null,
  date date not null,
  category text not null default 'especial',
  title text not null,
  description text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One manual announcement per date and association (simple UX)
create unique index if not exists calendar_announcements_assoc_date_uidx
  on public.calendar_announcements (association_id, date);

-- If the table already exists from a previous version, this is safe to run.
alter table public.calendar_announcements
  add column if not exists category text not null default 'especial';


-- Optional: keep updated_at current if you want
-- (If you don't want triggers, the API already sets updated_at explicitly)
-- create or replace function public.set_updated_at() returns trigger as $$
-- begin
--   new.updated_at = now();
--   return new;
-- end;
-- $$ language plpgsql;
--
-- drop trigger if exists tr_calendar_announcements_updated_at on public.calendar_announcements;
-- create trigger tr_calendar_announcements_updated_at
-- before update on public.calendar_announcements
-- for each row execute function public.set_updated_at();
