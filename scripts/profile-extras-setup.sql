-- Profile Extras (campos opcionales)
-- Ejecuta este script en Supabase SQL Editor.

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

-- El usuario puede ver/editar sus extras
DO $$ BEGIN
  create policy "profile_extras_self_select" on public.profile_extras
    for select
    to authenticated
    using (auth.uid()::uuid = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "profile_extras_self_upsert" on public.profile_extras
    for insert
    to authenticated
    with check (auth.uid()::uuid = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "profile_extras_self_update" on public.profile_extras
    for update
    to authenticated
    using (auth.uid()::uuid = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
