-- Role management helpers and policies for profiles.
-- Roles: creador, admin, avanzado, usuario

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

create trigger enforce_advanced_limit
before insert or update of role on public.profiles
for each row
execute function public.enforce_advanced_limit();

alter table public.profiles enable row level security;

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
