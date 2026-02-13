-- Tables for events, prices, and registrations

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  association_id uuid references public.associations(id),
  name text not null,
  format text check (format in ('stroke', 'match', 'stableford')),
  location text,
  description text,
  registration_start_date date,
  registration_end_date date,
  start_date date,
  end_date date,
  created_at timestamptz default now()
);

create table if not exists public.event_prices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,
  price numeric(10,2) not null,
  currency text default 'EUR',
  created_at timestamptz default now()
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text,
  created_at timestamptz default now(),
  unique (event_id, user_id)
);

create index if not exists idx_events_association on public.events(association_id);
create index if not exists idx_event_prices_event on public.event_prices(event_id);
create index if not exists idx_event_registrations_event on public.event_registrations(event_id);

alter table public.events enable row level security;
alter table public.event_prices enable row level security;
alter table public.event_registrations enable row level security;

-- Read policies
create policy events_read_all
on public.events
for select
using (true);

create policy event_prices_read_all
on public.event_prices
for select
using (true);

create policy event_registrations_read_all
on public.event_registrations
for select
using (true);

-- Insert/delete registrations for logged-in users
create policy event_registrations_insert
on public.event_registrations
for insert
with check (auth.uid() = user_id);

create policy event_registrations_delete
on public.event_registrations
for delete
using (auth.uid() = user_id);
