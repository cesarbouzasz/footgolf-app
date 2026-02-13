-- Event final classification audit history
-- Stores snapshots of events.config.finalClassification and lock state changes.

create table if not exists public.event_classification_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  action text not null check (action in ('update', 'lock', 'unlock')),
  locked boolean not null default false,
  final_classification_snapshot jsonb not null default '[]'::jsonb
);

create index if not exists idx_event_classification_audit_event_id_created_at
  on public.event_classification_audit (event_id, created_at desc);
