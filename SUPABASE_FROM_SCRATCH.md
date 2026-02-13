# Supabase (desde cero) — Footgolf Total

Este documento resume **todas las tablas, vínculos y parámetros** que la app usa hoy para que puedas crear un proyecto Supabase nuevo y dejarlo funcionando igual.

> Nota: En el repo existe `EstadoSupabase.md` con un inventario amplio. Este archivo es el “paso a paso reproducible” y corrige algunas diferencias detectadas por el código (p.ej. `associations.admin_id` y el esquema actual de `events`).

---

## 1) Variables de entorno (Next.js)

Crea un `.env.local` (o variables en tu hosting) con:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret-key>

# Storage (avatar). Opcional: por defecto "assets"
NEXT_PUBLIC_AVATAR_BUCKET=assets

# Bootstrap para convertir tu usuario en creador (opcional pero recomendado)
# (se usa en server routes)
BOOTSTRAP_ADMIN_EMAIL=tuemail@dominio.com

# (se usa en cliente para habilitar UI de admin "bootstrap")
NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL=tuemail@dominio.com
```

**Importante**
- `SUPABASE_SERVICE_ROLE_KEY` **no** debe exponerse al navegador (por eso NO lleva `NEXT_PUBLIC_`).
- Varias API Routes usan `runtime = 'nodejs'` y el service role para evitar bloqueos por RLS.

---

## 2) Orden recomendado para crear la BD

Ejecuta en **Supabase Dashboard → SQL Editor** en este orden:

1. **Extensiones** (UUIDs)
2. **Esquema base** (tablas core)
3. **Parches obligatorios** (columnas que el código usa)
4. **Scripts auxiliares** (roles, extras de perfil, incidencias, calendario)
5. **Eventos (esquema actual)** + `event_prices` + `event_registrations`

---

## 3) SQL — Extensiones

```sql
create extension if not exists pgcrypto;
```

---

## 4) SQL — Esquema base (tablas core)

Las tablas “clásicas” están descritas en detalle en `EstadoSupabase.md` (asociaciones, profiles, courses, tournaments, games, scores, registrations, rankings, news, support_tickets, etc.).

Si quieres **crear desde cero sin depender de ese documento**, usa como mínimo el siguiente núcleo (puedes ampliar luego con lo de `EstadoSupabase.md`):

### 4.1 `associations`

```sql
create table if not exists public.associations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  country text default 'España',
  region text,
  admin_id uuid null, -- FK se añade en el parche (para evitar orden circular)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_associations_name on public.associations(name);
```

### 4.2 `profiles` (extensión de `auth.users`)

Roles usados por el código hoy:
- `creador`, `admin`, `avanzado`, `usuario`, `guest`

```sql
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

create index if not exists idx_profiles_association_id on public.profiles(association_id);
create index if not exists idx_profiles_default_association_id on public.profiles(default_association_id);
create index if not exists idx_profiles_role on public.profiles(role);

-- RLS mínimo recomendado (necesario si el frontend hace upsert en /signup)
alter table public.profiles enable row level security;

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
```

### 4.3 `courses`

(La app lista/filtra por `association_id`.)

```sql
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  name text not null,
  location text,
  pars integer[] not null,
  distances integer[],
  hole_info jsonb,
  local_rules text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_courses_association on public.courses(association_id);
```

### 4.4 Otras tablas core

Si estás rearmando *exactamente* lo de antes, ejecuta también el SQL de `EstadoSupabase.md` para:
- `tournaments`, `games`, `scores`, `registrations`, `rankings`, `news`, `support_tickets`

---

## 5) SQL — Parches obligatorios detectados por el código

### 5.1 `associations.admin_id` (usado para permisos fallback)

El código consulta `associations.admin_id` en endpoints admin.

```sql
alter table public.associations
  add column if not exists admin_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'associations_admin_id_fkey'
  ) then
    alter table public.associations
      add constraint associations_admin_id_fkey
      foreign key (admin_id) references public.profiles(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_associations_admin_id on public.associations(admin_id);
```

---

## 6) Scripts SQL del repo (ejecutar tal cual)

Ejecuta estos archivos en Supabase SQL Editor:

1. `scripts/roles-setup.sql`
2. `scripts/profile-extras-setup.sql`
3. `scripts/admin-messages-setup.sql`
4. `scripts/calendar-announcements-setup.sql`

**Notas**
- `scripts/roles-setup.sql`:
  - Normaliza roles antiguos (`user` → `usuario`, `advanced` → `avanzado`).
  - Crea trigger `enforce_advanced_limit` (máximo 2 “avanzado” por asociación).
  - Añade policies para que `creador` y `admin` gestionen roles.

---

## 7) Calendario — `calendar_announcements`

La tabla se crea en `scripts/calendar-announcements-setup.sql`.

La app la usa en:
- Admin: `/api/admin/calendar`
- Miembros: `/api/calendar` (mezcla torneos + anuncios)

Columnas mínimas (ya coinciden con el script):
- `association_id`, `date`, `category`, `title`, `description`, `created_by`, `updated_at`

---

## 8) Incidencias internas — `admin_messages`

La tabla se crea en `scripts/admin-messages-setup.sql`.

La app la usa en:
- Crear incidencia: `/api/support/incidents`
- Bandeja admin + contador: `/api/admin/messages` y `/api/admin/messages/count`

---

## 9) Perfil — `profile_extras`

La tabla se crea en `scripts/profile-extras-setup.sql`.

Se usa como **fallback** cuando tu tabla `profiles` no tiene columnas opcionales (p.ej. `region`, `province`, `phone`, `avatar_url`).

---

## 10) Eventos — ESQUEMA ACTUAL (IMPORTANTE)

En el repo hay un `scripts/events-setup.sql`, pero el **frontend actual** espera que `events` tenga estas columnas:
- `status`, `competition_mode`, `registration_start`, `registration_end`, `event_date`, `course_id`, `config`, `registered_player_ids`, `has_handicap_ranking`, `created_by`

Para empezar desde cero y que funcione igual que ahora, ejecuta este SQL (y úsalo como “fuente de verdad” para `events`):

```sql
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

create index if not exists idx_events_event_date on public.events(event_date);
create index if not exists idx_events_association_id on public.events(association_id);
create index if not exists idx_events_course_id on public.events(course_id);

alter table public.events enable row level security;

-- Lectura pública (el front lista eventos directamente desde el cliente)
do $$ begin
  create policy "events_read_all" on public.events
    for select
    using (true);
exception when duplicate_object then null;
end $$;

-- Registro de usuario: el front actual hace UPDATE sobre events.registered_player_ids.
-- (Permiso amplio para no romper la UX actual)
do $$ begin
  create policy "events_update_authenticated" on public.events
    for update
    to authenticated
    using (auth.uid() is not null)
    with check (auth.uid() is not null);
exception when duplicate_object then null;
end $$;

-- (Opcional) Solo staff crea/borra eventos desde cliente SQL / herramientas.
-- Si tu creación/borrado siempre será via service_role, puedes omitirlo.
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
```

### 10.1 `event_prices` y `event_registrations`

Estas dos tablas sí están alineadas con el código y se usan para precios y estadísticas:

```sql
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

-- Lectura
DO $$ BEGIN
  create policy "event_prices_read_all" on public.event_prices
    for select
    using (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "event_registrations_read_all" on public.event_registrations
    for select
    using (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Insert/delete propias
DO $$ BEGIN
  create policy "event_registrations_insert" on public.event_registrations
    for insert
    with check (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  create policy "event_registrations_delete" on public.event_registrations
    for delete
    using (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

---

## 11) Storage (avatars)

El avatar se sube desde una API route que usa `service_role` y luego se obtiene una URL pública con:
- Bucket: `NEXT_PUBLIC_AVATAR_BUCKET` (por defecto `assets`)
- Objeto: `public/<userId>/<timestamp>.jpg`

Para que funcione “tal cual” (URLs públicas):
1. Supabase Dashboard → **Storage** → **Create bucket**
2. Nombre: `assets` (o el que pongas en `NEXT_PUBLIC_AVATAR_BUCKET`)
3. Modo: **Public**

---

## 12) Checklist de verificación (end-to-end)

1. Crear 1 asociación:
   - `insert into public.associations (name, country, region) values ('AGFG','España','Galicia');`
2. Registrar un usuario con la UI (`/signup`) y confirmar que existe su fila en `public.profiles`.
3. (Opcional) Convertir tu usuario en `creador`:
   - Configura `BOOTSTRAP_ADMIN_EMAIL` y `NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL`.
   - Loguea con ese email y visita una vez la app (se llama a `/api/profile/bootstrap-admin`).
4. Asociar usuario a asociación:
   - `update public.profiles set association_id = '<assoc_id>', default_association_id = '<assoc_id>' where id = '<user_id>';`
5. Marcar `associations.admin_id`:
   - `update public.associations set admin_id = '<user_id>' where id = '<assoc_id>';`
6. Probar:
   - Perfil: región/provincia/phone guardan (via `profile_extras`).
   - Admin: contador de incidencias (tabla `admin_messages`).
   - Calendario: anuncios manuales (`calendar_announcements`).
   - Eventos: listado y registro (requiere policies de `events`).

---

## 13) Tablas usadas por el código (resumen rápido)

Detectadas por `.from('...')` en el repo:
- `profiles`
- `associations`
- `courses`
- `tournaments`
- `rankings`
- `news`
- `events`
- `event_registrations`
- `calendar_announcements`
- `profile_extras`
- `admin_messages`

Si quieres, puedo también dejar un **script único** `scripts/00-bootstrap-all.sql` que ejecute todo en orden (y así solo pegáis 1 bloque en SQL Editor).