-- Admin Inbox Messages
-- Ejecuta este script en Supabase SQL Editor.

create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  association_id uuid null references public.associations(id) on delete set null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_by_email text null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_admin_messages_assoc_unread on public.admin_messages(association_id, is_read);
create index if not exists idx_admin_messages_created_at on public.admin_messages(created_at desc);

alter table public.admin_messages enable row level security;

-- Políticas mínimas (opcional). La app usa service_role en API routes.
-- Usuarios autenticados pueden insertar (abrir incidencia)
DO $$ BEGIN
  create policy "admin_messages_insert_authenticated" on public.admin_messages
    for insert
    to authenticated
    with check (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Staff puede leer (admin/creador/is_admin)
DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Staff puede marcar como leído
DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
