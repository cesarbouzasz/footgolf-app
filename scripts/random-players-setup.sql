-- Optional: log for admin random player generation

create table if not exists public.player_generation_log (
  id uuid primary key default gen_random_uuid(),
  association_id uuid null,
  created_by uuid null,
  count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_player_generation_log_assoc_created
  on public.player_generation_log (association_id, created_at desc);
