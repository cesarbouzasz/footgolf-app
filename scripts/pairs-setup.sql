-- Tables for pairs (parejas)

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (association_id, name)
);

create index if not exists idx_pairs_association_id on public.pairs(association_id);

create table if not exists public.pair_members (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (pair_id, player_id)
);

create index if not exists idx_pair_members_pair_id on public.pair_members(pair_id);
create index if not exists idx_pair_members_player_id on public.pair_members(player_id);

alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;

do $$ begin
  create policy pairs_read_all
  on public.pairs
  for select
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy pairs_write_staff
  on public.pairs
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
  create policy pair_members_read_all
  on public.pair_members
  for select
  using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy pair_members_write_staff
  on public.pair_members
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
