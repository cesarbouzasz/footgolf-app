-- Footgolf Total — Bootstrap Supabase from scratch
-- Ejecuta este archivo completo en Supabase Dashboard → SQL Editor.
-- Objetivo: dejar el proyecto listo para que la app funcione "igual que ahora".
--
-- Incluye:
-- - associations (+ admin_id)
-- - profiles (roles actuales)
-- - courses (+ local_rules)
-- - profile_extras
-- - admin_messages
-- - calendar_announcements
-- - role policies + trigger limite "avanzado"
-- - events (esquema actual usado por el frontend) + event_prices + event_registrations

-- 0) Extensiones
create extension if not exists pgcrypto;

-- 1) Tablas core
create table if not exists public.associations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  country text default 'España',
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  first_name text,
  last_name text,
  phone text,
  region text,
  province text,
  handicap numeric default 0,
  role text check (role in ('admin','creador','avanzado','usuario','guest')) default 'usuario',
  association_id uuid null references public.associations(id) on delete set null,
  default_association_id uuid null references public.associations(id) on delete set null,
  chatbot_enabled boolean default true,
  is_admin boolean default false,
  admin_level text default null,
  category text,
  birth_year integer,
  team text,
  country text default 'España',
  avatar_url text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default now()
);

-- Si la tabla ya existía, garantiza columnas usadas por el frontend (/signup y /profile).
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists region text;
alter table public.profiles add column if not exists province text;
alter table public.profiles add column if not exists association_id uuid null;
alter table public.profiles add column if not exists default_association_id uuid null;

-- Si el proyecto venía de una versión antigua (sin default_association_id), usa association_id como fallback.
update public.profiles
set default_association_id = association_id
where default_association_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_association_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_association_id_fkey
      foreign key (association_id) references public.associations(id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_default_association_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_default_association_id_fkey
      foreign key (default_association_id) references public.associations(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_profiles_association_id on public.profiles(association_id);
create index if not exists idx_profiles_default_association_id on public.profiles(default_association_id);
create index if not exists idx_profiles_role on public.profiles(role);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  name text not null,
  location text,
  image_url text null,
  pars integer[] not null,
  distances integer[],
  hole_info jsonb,
  local_rules text null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.courses add column if not exists image_url text;
-- Si la tabla ya existía, garantiza columnas usadas por índices/API.
alter table public.courses add column if not exists association_id uuid;
alter table public.courses add column if not exists name text;

create index if not exists idx_courses_association on public.courses(association_id);

-- 2) Parche obligatorio: associations.admin_id (permiso fallback)
alter table public.associations
  add column if not exists admin_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'associations_admin_id_fkey'
  ) then
    alter table public.associations
      add constraint associations_admin_id_fkey
      foreign key (admin_id) references public.profiles(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_associations_admin_id on public.associations(admin_id);

-- 3) profile_extras
create table if not exists public.profile_extras (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  region text,
  province text,
  avatar_url text,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profile_extras_updated_at on public.profile_extras(updated_at desc);

alter table public.profile_extras enable row level security;

do $$ begin
  create policy "profile_extras_self_select" on public.profile_extras
    for select
    to authenticated
    using (auth.uid()::uuid = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profile_extras_self_upsert" on public.profile_extras
    for insert
    to authenticated
    with check (auth.uid()::uuid = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profile_extras_self_update" on public.profile_extras
    for update
    to authenticated
    using (auth.uid()::uuid = user_id);
exception when duplicate_object then null;
end $$;

-- 4) admin_messages
create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  association_id uuid null references public.associations(id) on delete set null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_by_email text null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- Si la tabla ya existía (create table if not exists no altera), garantiza columnas usadas por índices y API.
alter table public.admin_messages add column if not exists association_id uuid null;
alter table public.admin_messages add column if not exists created_by uuid null;
alter table public.admin_messages add column if not exists created_by_email text null;
alter table public.admin_messages add column if not exists is_read boolean;
alter table public.admin_messages add column if not exists created_at timestamptz;

create index if not exists idx_admin_messages_assoc_unread on public.admin_messages(association_id, is_read);
create index if not exists idx_admin_messages_created_at on public.admin_messages(created_at desc);

alter table public.admin_messages enable row level security;

do $$ begin
  create policy "admin_messages_insert_authenticated" on public.admin_messages
    for insert
    to authenticated
    with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin_messages_select_staff" on public.admin_messages
    for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()::uuid
          and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin_messages_update_staff" on public.admin_messages
    for update
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()::uuid
          and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
      )
    );
exception when duplicate_object then null;
end $$;

-- 5) calendar_announcements
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

-- Si la tabla ya existía, garantiza columnas antes de índices únicos.
alter table public.calendar_announcements add column if not exists association_id uuid;
alter table public.calendar_announcements add column if not exists date date;

create unique index if not exists calendar_announcements_assoc_date_uidx
  on public.calendar_announcements (association_id, date);

alter table public.calendar_announcements
  add column if not exists category text not null default 'especial';

-- 5b) tournament_notifications (avisos flotantes a jugadores por torneo)
create table if not exists public.tournament_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  message text not null,
  audience text not null default 'all', -- all | selected
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

do $$ begin
  alter table public.tournament_notifications
    add constraint tournament_notifications_audience_check
    check (audience in ('all','selected'));
exception when duplicate_object then null;
end $$;

create index if not exists idx_tournament_notifications_event_active
  on public.tournament_notifications(event_id, is_active, created_at desc);

create table if not exists public.tournament_notification_recipients (
  notification_id uuid not null references public.tournament_notifications(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (notification_id, player_id)
);

create index if not exists idx_tournament_notification_recipients_player
  on public.tournament_notification_recipients(player_id);

create table if not exists public.tournament_notification_dismissals (
  notification_id uuid not null references public.tournament_notifications(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default timezone('utc', now()),
  primary key (notification_id, player_id)
);

create index if not exists idx_tournament_notification_dismissals_player
  on public.tournament_notification_dismissals(player_id);

alter table public.tournament_notifications enable row level security;
alter table public.tournament_notification_recipients enable row level security;
alter table public.tournament_notification_dismissals enable row level security;

-- Players can read active notifications only if they are registered in the event.
do $$ begin
  create policy "tournament_notifications_select_registered" on public.tournament_notifications
    for select
    to authenticated
    using (
      is_active = true
      and exists (
        select 1 from public.event_registrations r
        where r.event_id = tournament_notifications.event_id
          and r.user_id = auth.uid()::uuid
      )
      and (
        audience = 'all'
        or exists (
          select 1 from public.tournament_notification_recipients tr
          where tr.notification_id = tournament_notifications.id
            and tr.player_id = auth.uid()::uuid
        )
      )
    );
exception when duplicate_object then null;
end $$;

-- Staff write access.
do $$ begin
  create policy "tournament_notifications_staff_write" on public.tournament_notifications
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
exception when duplicate_object then null;
end $$;

-- Recipients: player can read own, staff can manage.
do $$ begin
  create policy "tournament_notification_recipients_select_self" on public.tournament_notification_recipients
    for select
    to authenticated
    using (player_id = auth.uid()::uuid);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "tournament_notification_recipients_staff_write" on public.tournament_notification_recipients
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
exception when duplicate_object then null;
end $$;

-- Dismissals: player can insert/select own (to avoid re-showing), staff can read.
do $$ begin
  create policy "tournament_notification_dismissals_select_self" on public.tournament_notification_dismissals
    for select
    to authenticated
    using (player_id = auth.uid()::uuid);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "tournament_notification_dismissals_insert_self" on public.tournament_notification_dismissals
    for insert
    to authenticated
    with check (player_id = auth.uid()::uuid);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "tournament_notification_dismissals_staff_select" on public.tournament_notification_dismissals
    for select
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()::uuid
          and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
      )
    );
exception when duplicate_object then null;
end $$;

-- 6) Roles: normalización + policies + trigger límite "avanzado"
update public.profiles set role = 'usuario' where role = 'user';
update public.profiles set role = 'avanzado' where role = 'advanced';

create or replace function public.enforce_advanced_limit()
returns trigger
language plpgsql
as $$
declare
  current_count integer;
begin
  if new.role = 'avanzado' then
    select count(*) into current_count
    from public.profiles
    where association_id = new.association_id
      and role = 'avanzado'
      and id <> new.id;

    if current_count >= 2 then
      raise exception 'Solo se permiten 2 usuarios avanzados por asociacion.';
    end if;
  end if;

  return new;
end;
$$;

alter table public.profiles enable row level security;

-- 6b) Teams (equipos) por asociación
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  name text not null,
  max_players integer not null default 4,
  created_at timestamptz not null default timezone('utc', now()),
  unique (association_id, name)
);

-- Si la tabla ya existía, garantiza columnas usadas por índices/constraints.
alter table public.teams add column if not exists association_id uuid;
alter table public.teams add column if not exists name text;

create index if not exists idx_teams_association_id on public.teams(association_id);

-- 6c) Información: enlaces y noticias
create table if not exists public.info_links (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  title text not null,
  url text not null,
  note text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.info_links add column if not exists association_id uuid;

create index if not exists idx_info_links_assoc_created_at on public.info_links(association_id, created_at desc);

create table if not exists public.info_news (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  title text not null,
  body text not null,
  image_url text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.info_news add column if not exists association_id uuid;
alter table public.info_news add column if not exists image_url text;

create index if not exists idx_info_news_assoc_created_at on public.info_news(association_id, created_at desc);

-- Policies mínimas para que cada usuario autenticado pueda leer/crear/actualizar su propio perfil.
-- Esto es necesario porque el frontend hace upsert en /signup usando el cliente browser.
do $$ begin
  create policy "profiles_self_select" on public.profiles
    for select
    to authenticated
    using (auth.uid() = id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_self_insert" on public.profiles
    for insert
    to authenticated
    with check (auth.uid() = id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "profiles_self_update" on public.profiles
    for update
    to authenticated
    using (auth.uid() = id)
    with check (auth.uid() = id);
exception when duplicate_object then null;
end $$;

drop trigger if exists enforce_advanced_limit on public.profiles;
create trigger enforce_advanced_limit
before insert or update of role on public.profiles
for each row
execute function public.enforce_advanced_limit();

-- NOTE: Avoid recursive policies referencing profiles inside profiles.
-- Use SECURITY DEFINER helpers to read staff role safely.
create or replace function public.is_creator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'creador'
  );
$$;

create or replace function public.is_admin_for_assoc(target_assoc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.association_id = target_assoc_id
  );
$$;

drop policy if exists profiles_role_creator on public.profiles;
drop policy if exists profiles_role_admin on public.profiles;
drop policy if exists profiles_read_admin on public.profiles;
drop policy if exists profiles_read_authenticated on public.profiles;

create policy profiles_read_admin
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.is_creator()
  or (association_id is not null and public.is_admin_for_assoc(association_id))
);

-- 7) Events (esquema actual usado por el frontend)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  association_id uuid null references public.associations(id) on delete set null,
  course_id uuid null references public.courses(id) on delete set null,

  name text not null,
  status text null,
  competition_mode text null,
  registration_start date null,
  registration_end date null,
  event_date date null,
  location text null,
  description text null,

  config jsonb not null default '{}'::jsonb,
  registered_player_ids uuid[] not null default '{}'::uuid[],
  has_handicap_ranking boolean not null default false,

  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Si la tabla ya existía, garantiza columnas usadas por índices/policies.
alter table public.events add column if not exists association_id uuid null;
alter table public.events add column if not exists course_id uuid null;
alter table public.events add column if not exists event_date date null;

create index if not exists idx_events_event_date on public.events(event_date);
create index if not exists idx_events_association_id on public.events(association_id);
create index if not exists idx_events_course_id on public.events(course_id);

alter table public.events enable row level security;

do $$ begin
  create policy "events_read_all" on public.events
    for select
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "events_update_authenticated" on public.events
    for update
    to authenticated
    using (auth.uid() is not null)
    with check (auth.uid() is not null);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "events_insert_staff" on public.events
    for insert
    to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()::uuid
          and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "events_delete_staff" on public.events
    for delete
    to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid()::uuid
          and (p.role in ('admin','creador') or coalesce(p.is_admin,false) = true)
      )
    );
exception when duplicate_object then null;
end $$;

-- 7b) Equipos por torneo/evento (un jugador solo puede estar en 1 equipo por evento)
create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  max_players integer not null default 2,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (event_id, name)
);

alter table public.event_teams add column if not exists association_id uuid;
alter table public.event_teams add column if not exists event_id uuid;

create index if not exists idx_event_teams_event_id on public.event_teams(event_id);
create index if not exists idx_event_teams_association_id on public.event_teams(association_id);

create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.event_teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (team_id, player_id),
  unique (event_id, player_id)
);

alter table public.event_team_members add column if not exists association_id uuid;
alter table public.event_team_members add column if not exists event_id uuid;
alter table public.event_team_members add column if not exists team_id uuid;
alter table public.event_team_members add column if not exists player_id uuid;

create index if not exists idx_event_team_members_event_id on public.event_team_members(event_id);
create index if not exists idx_event_team_members_team_id on public.event_team_members(team_id);
create index if not exists idx_event_team_members_player_id on public.event_team_members(player_id);

alter table public.event_teams enable row level security;
alter table public.event_team_members enable row level security;

do $$ begin
  create policy "event_teams_read_all" on public.event_teams
    for select
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "event_team_members_read_all" on public.event_team_members
    for select
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "event_teams_write_staff" on public.event_teams
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
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "event_team_members_write_staff" on public.event_team_members
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
exception when duplicate_object then null;
end $$;

-- 8) event_prices + event_registrations
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

create index if not exists idx_event_prices_event on public.event_prices(event_id);
create index if not exists idx_event_registrations_event on public.event_registrations(event_id);

alter table public.event_prices enable row level security;
alter table public.event_registrations enable row level security;

do $$ begin
  create policy "event_prices_read_all" on public.event_prices
    for select
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "event_registrations_read_all" on public.event_registrations
    for select
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "event_registrations_insert" on public.event_registrations
    for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "event_registrations_delete" on public.event_registrations
    for delete
    using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
