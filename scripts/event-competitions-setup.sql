-- Tables for event competitions and scorecards

create table if not exists public.event_competitions (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  competition_type text not null check (competition_type in ('individual','parejas','equipos')),
  status text null,
  status_mode text not null default 'auto',
  registration_start date null,
  registration_end date null,
  course_id uuid null references public.courses(id) on delete set null,
  max_players integer null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_event_competitions_event_id on public.event_competitions(event_id);
create index if not exists idx_event_competitions_association_id on public.event_competitions(association_id);
create index if not exists idx_event_competitions_type on public.event_competitions(competition_type);

alter table public.event_competitions enable row level security;

create policy event_competitions_read_all
on public.event_competitions
for select
using (true);

create policy event_competitions_write_staff
on public.event_competitions
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()::uuid
      and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()::uuid
      and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
  )
);

create table if not exists public.event_cards (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  competition_id uuid null references public.event_competitions(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hole_scores integer[] not null,
  total_score integer null,
  holes_played integer null,
  status text not null default 'valid',
  invalidated_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_event_cards_event_id on public.event_cards(event_id);
create index if not exists idx_event_cards_competition_id on public.event_cards(competition_id);
create index if not exists idx_event_cards_user_id on public.event_cards(user_id);
create index if not exists idx_event_cards_status on public.event_cards(status);

alter table public.event_cards enable row level security;

create policy event_cards_read_all
on public.event_cards
for select
using (true);

create policy event_cards_insert_self
on public.event_cards
for insert
to authenticated
with check (auth.uid()::uuid = user_id);

create policy event_cards_write_staff
on public.event_cards
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()::uuid
      and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()::uuid
      and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
  )
);
