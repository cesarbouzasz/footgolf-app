-- Association notifications: floating message for players by association

create table if not exists public.association_notifications (
  id uuid primary key default gen_random_uuid(),
  association_id uuid null,
  message text not null,
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_association_notifications_assoc_created
  on public.association_notifications (association_id, created_at desc);

create table if not exists public.association_notification_dismissals (
  notification_id uuid not null references public.association_notifications(id) on delete cascade,
  player_id uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (notification_id, player_id)
);

create index if not exists idx_assoc_notif_dismissals_player
  on public.association_notification_dismissals (player_id);
