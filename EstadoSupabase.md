# 📊 Estado Completo de Supabase - FootGolf Total

**Última Actualización:** Febrero 6, 2026  
**Estado:** ✅ Operativo y Configurado

---

## 🚀 CONFIGURACIÓN DE CONEXIÓN

### Variables de Entorno Requeridas

Ubicación: `.env.local` (raíz del proyecto)

```bash
# URLs y Keys Públicas (pueden exponerse)
NEXT_PUBLIC_SUPABASE_URL=https://[tu-proyecto].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[tu-clave-anon-pública]

# Keys de Administración (PRIVADO - Solo lado servidor)
SUPABASE_SERVICE_ROLE_KEY=[tu-clave-service-role-privada]
```

### Clientes Supabase en el Proyecto

| Ubicación | Tipo | Uso |
|-----------|------|-----|
| `src/lib/supabase.ts` | Browser Client | Componentes lado cliente ('use client') |
| `src/lib/supabase-server.ts` | Server Client | Server Components y API Routes |
| `src/middleware.ts` | Middleware Client | Autenticación en rutas protegidas |

---

## 🗂️ ESQUEMA DE BASE DE DATOS

### 1. **Tabla: `associations`**
Asociaciones de Fox para multi-tenancy

```sql
CREATE TABLE associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  country TEXT DEFAULT 'España',
  region TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Registros Actuales:
- **AGFG** - Galicia, España
- **CyL** - Castilla y León, España

---

### 2. **Tabla: `profiles`** (Extensión de auth.users)
Perfiles de usuarios vinculados a autenticación

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  handicap DECIMAL DEFAULT 0,
  role TEXT CHECK (role IN ('admin', 'creador', 'user', 'guest')) DEFAULT 'user',
  association_id UUID REFERENCES associations(id) ON DELETE SET NULL,
  default_association_id UUID REFERENCES associations(id) ON DELETE SET NULL,
  chatbot_enabled BOOLEAN DEFAULT true,
  is_admin BOOLEAN DEFAULT false,
  admin_level TEXT DEFAULT NULL,  -- 'super', 'association', etc.
  category TEXT,  -- 'Absoluta', 'Hombres', 'Senior', 'Senior+', 'Mujeres', 'Juniors'
  birth_year INTEGER,
  team TEXT,
  country TEXT DEFAULT 'España',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Campos Importantes:
- `role`: Controla permisos básicos (por RLS)
- `association_id`: Asociación principal del usuario
- `default_association_id`: Asociación por defecto al login
- `chatbot_enabled`: Flag para habilitar/deshabilitar BirdyBot
- `admin_level`: 'super' (admin global), 'association' (admin de asociación)

#### Índices:
```sql
CREATE INDEX idx_profiles_association ON profiles(association_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_admin ON profiles(is_admin);
```

---

### 3. **Tabla: `courses`** (Campos de Fox)
Campos de Fox registrados por asociación

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  pars INTEGER[] NOT NULL,  -- Array [3,4,4,3,5,4,3,4,4,3,4,4,3,5,4,3,4,4]
  distances INTEGER[],  -- Array de distancias por hoyo
  hole_info JSONB,  -- Información técnica de cada hoyo
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

#### Índices:
```sql
CREATE INDEX idx_courses_association ON courses(association_id);
```

---

### 4. **Tabla: `tournaments`** (Torneos)
Torneos y eventos

```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  format TEXT CHECK (format IN ('stroke', 'match', 'stableford')) DEFAULT 'stroke',
  location TEXT,
  category TEXT CHECK (category IN ('Absoluta', 'Hombres', 'Senior', 'Senior+', 'Mujeres', 'Juniors')),
  brackets JSONB,  -- Para Match Play
  is_official BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

#### Índices:
```sql
CREATE INDEX idx_tournaments_association ON tournaments(association_id);
CREATE INDEX idx_tournaments_dates ON tournaments(start_date);
```

---

### 5. **Tabla: `games`** (Partidas)
Partidas dentro de torneos

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  players UUID[] NOT NULL,  -- Array de UUIDs de jugadores [marker_id, player2_id, ...]
  status TEXT DEFAULT 'active',  -- 'active', 'completed', 'cancelled'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

**Nota:** El primer jugador `(players)[1]` es el "marker" (responsable de registrar puntuaciones).

#### Índices:
```sql
CREATE INDEX idx_games_tournament ON games(tournament_id);
```

---

### 6. **Tabla: `scores`** (Puntuaciones)
Sistema real-time de puntuaciones por hoyo

```sql
CREATE TABLE scores (
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes INTEGER NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  PRIMARY KEY (game_id, user_id, hole_number)
);
```

**Real-time:** Habilitado en Supabase para actualizaciones en vivo.

#### Índices:
```sql
CREATE INDEX idx_scores_game ON scores(game_id);
CREATE INDEX idx_scores_user ON scores(user_id);
```

---

### 7. **Tabla: `registrations`** (Inscripciones)
Registro de jugadores en torneos

```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(tournament_id, player_id)
);
```

#### Índices:
```sql
CREATE INDEX idx_registrations_tournament ON registrations(tournament_id);
CREATE INDEX idx_registrations_player ON registrations(player_id);
```

---

### 8. **Tabla: `support_tickets`** (Soporte)
Sistema de tickets de soporte

```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  description TEXT NOT NULL,
  screenshot_url TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Índices:
```sql
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX idx_support_tickets_email ON support_tickets(user_email);
```

---

### 9. **Tabla: `rankings`** (Clasificaciones)
Ranking dinámico de jugadores en torneos

```sql
CREATE TABLE rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position INTEGER,
  total_strokes INTEGER,
  vs_par_score TEXT,
  holes_played INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

#### Índices:
```sql
CREATE INDEX idx_rankings_association ON rankings(association_id);
CREATE INDEX idx_rankings_tournament ON rankings(tournament_id);
CREATE INDEX idx_rankings_player ON rankings(player_id);
```

---

### 10. **Tabla: `news`** (Noticias)
Noticias por asociación

```sql
CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);
```

#### Índices:
```sql
CREATE INDEX idx_news_association ON news(association_id);
CREATE INDEX idx_news_published ON news(published_at DESC);
```

---

## 🔐 SEGURIDAD: Row Level Security (RLS)

### Estado RLS por Tabla

| Tabla | RLS Habilitador | Descripción |
|-------|-----------------|-------------|
| `profiles` | ✅ ON | Usuarios solo ven/editan su perfil o si son admin |
| `scores` | ✅ ON | Solo el marker o admin puede modificar |
| `games` | ✅ ON | Solo marker o admin puede editar |
| `tournaments` | ✅ ON | Solo users de la misma asociación ven/editan |
| `courses` | ✅ ON | Solo users de la misma asociación ven |
| `rankings` | ✅ ON | Solo users de la misma asociación ven |
| `news` | ✅ ON | Solo users de la misma asociación ven |
| `support_tickets` | ✅ ON | Admins ven todos; usuarios pueden insertar |
| `registrations` | ✅ ON | Según acceso al torneo |

### Políticas Principales

#### **1. Scores: Solo marker o admin puede modificar**
```sql
DROP POLICY IF EXISTS "only_marker_or_admin_can_modify_scores" ON public.scores;
CREATE POLICY "only_marker_or_admin_can_modify_scores" ON public.scores
FOR ALL
USING (
  auth.uid()::uuid = (
    SELECT (players)[1]
    FROM public.games
    WHERE id = public.scores.game_id
    LIMIT 1
  )
  OR
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND (role = 'admin' OR is_admin = true)
  )
);
```

#### **2. Profiles: El propietario o admin puede editar**
```sql
DROP POLICY IF EXISTS "profiles_owner_or_admin" ON public.profiles;
CREATE POLICY "profiles_owner_or_admin" ON public.profiles
FOR ALL
USING (
  auth.uid()::uuid = id
  OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND (role = 'admin' OR is_admin = true))
);
```

#### **3. Games: Solo marker o admin puede editar/eliminar**
```sql
DROP POLICY IF EXISTS "games_marker_or_admin_update" ON public.games;
DROP POLICY IF EXISTS "games_marker_or_admin_delete" ON public.games;

CREATE POLICY "games_marker_or_admin_update" ON public.games
FOR UPDATE
USING (
  auth.uid()::uuid = (
    SELECT (players)[1]
    FROM public.games
    WHERE id = public.games.id
    LIMIT 1
  )
  OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND (role = 'admin' OR is_admin = true))
);

CREATE POLICY "games_marker_or_admin_delete" ON public.games
FOR DELETE
USING (
  auth.uid()::uuid = (
    SELECT (players)[1]
    FROM public.games
    WHERE id = public.games.id
    LIMIT 1
  )
  OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()::uuid AND (role = 'admin' OR is_admin = true))
);

DROP POLICY IF EXISTS "games_allow_insert_authenticated" ON public.games;
CREATE POLICY "games_allow_insert_authenticated" ON public.games
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
```

#### **4. Tournaments: Solo users de la misma asociación ven**
```sql
DROP POLICY IF EXISTS "Users can view tournaments from their association" ON public.tournaments;
CREATE POLICY "Users can view tournaments from their association" ON public.tournaments
FOR SELECT
USING (
  association_id IN (
    SELECT association_id FROM profiles WHERE id = auth.uid()::uuid
  )
  OR
  association_id IN (
    SELECT default_association_id FROM profiles WHERE id = auth.uid()::uuid
  )
);
```

#### **5. Support Tickets: Admins ven todo, usuarios pueden insertar**
```sql
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all support tickets" ON support_tickets
FOR SELECT
USING (
  auth.uid()::uuid IN (
    SELECT id FROM profiles WHERE role = 'admin' OR is_admin = true
  )
);

CREATE POLICY "Anyone can insert support tickets" ON support_tickets
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update support tickets" ON support_tickets
FOR UPDATE
USING (
  auth.uid()::uuid IN (
    SELECT id FROM profiles WHERE role = 'admin' OR is_admin = true
  )
);
```

---

## 🔓 AUTENTICACIÓN

### Sistema de Autenticación Implementado

#### Cliente: `src/context/auth-context.tsx`

```typescript
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  handicap: number;
  role: 'admin' | 'creador' | 'user' | 'guest';
  association_id?: string | null;
  default_association_id?: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isGuest: boolean;
  isAuthenticated: boolean;
  currentAssociationId: string | null;
  setCurrentAssociationId: (id: string | null) => void;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
}
```

### Flujo de Autenticación

1. **SignIn (Email + Contraseña)**
   - Usuario ingresa email y contraseña
   - `supabase.auth.signInWithPassword()` autentica
   - Se carga el perfil desde `profiles` table
   - Se sincroniza `default_association_id`

2. **Guest Login (Anónimo)**
   - `supabase.auth.signInAnonymously()` crea sesión anónima
   - `user_metadata.is_anonymous = true`
   - Sin perfil de BD
   - Acceso limitado

3. **SignOut**
   - Limpia estado local inmediatamente
   - Llama `supabase.auth.signOut()`
   - Con timeout de 2s

4. **SignUp (Registro)**
   - `supabase.auth.signUp(email, password)` crea usuario
   - Requiere confirmación por email (si está configurado)
   - El trigger de Supabase crea automáticamente perfil en `profiles`

### Políticas de Roles

| Role | Permisos |
|------|----------|
| `admin` | Todo (super admin global) |
| `creador` | Crear/editar eventos, ver estadísticas |
| `user` | Participar, ver rankings, jugar |
| `guest` | Demo limitado, sin persistencia |

---

## 🔄 FLUJOS DE SINCRONIZACIÓN

### AuthProvider (`src/context/auth-context.tsx`)

```
1. onMount
   ├─> getSession()
   ├─> Cargar perfil si existe en `profiles`
   └─> Configurar listeners

2. onAuthStateChange (continuo)
   ├─> SIGNED_IN
   │   ├─> setUser()
   │   └─> loadProfile()
   ├─> SIGNED_OUT
   │   ├─> setUser(null)
   │   └─> setProfile(null)
   └─> USER_UPDATED
       └─> Actualizar perfil si cambió

3. onUnmount
   └─> unsubscribe()
```

### Sincronización en Tiempo Real

- **`scores` table:** Usa `supabase_realtime` (habilitada)
- **Suscripciones:** En componentes que necesitan actualizaciones live
- **Ejemplo:**
  ```typescript
  supabase
    .channel('scores-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'scores' },
      ({ new, old, eventType }) => {
        // Actualizar UI
      }
    )
    .subscribe()
  ```

---

## 🛠️ SCRIPTS DE SETUP

### `scripts/setup-db.js`
Valida conexión a Supabase

```bash
node scripts/setup-db.js
```

**Acciones:**
- ✅ Valida `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Verifica conexión con `auth.admin.listUsers()`
- ✅ Verifica existencia de tablas

### `scripts/check-db.js`
Verifica estado de la BD

```bash
node scripts/check-db.js
```

---

## 📋 MIGRACIONES COMPLETADAS

### 1. **Inicialización de Schema** ✅
- Tablas: `profiles`, `courses`, `tournaments`, `games`, `scores`
- RLS habilitado
- Índices creados

### 2. **Agregar Asociaciones** ✅
- Tabla `associations` creada
- Columnas `association_id` y `default_association_id` agregadas a `profiles`
- Registros: AGFG, CyL

### 3. **Agregar Support System** ✅
- Tabla `support_tickets` creada
- Políticas RLS

### 4. **Agregar Ranking y News** ✅
- Tabla `rankings` creada
- Tabla `news` creada
- Índices de búsqueda

### 5. **Agregar Columas Admin** ✅
- `is_admin`, `admin_level`, `chatbot_enabled`

---

## 😊 INTEGRACIONES FRONTEND

### Login Page (`src/app/login/page.tsx`)
```typescript
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth-context';

// Usa supabase.auth.signInAnonymously() para demo
// Usa signIn(email, password) para usuario autenticado
```

### Protected Routes (Middleware)
```typescript
// src/middleware.ts
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ...
);

const { data: { user } } = await supabase.auth.getUser();
if (!user && path.startsWith('/dashboard')) {
  return NextResponse.redirect(new URL('/login', request.url));
}
```

### Admin Utils (`src/lib/admin-utils.ts`)
```typescript
import { supabase } from '@/lib/supabase';

export async function getAdminList() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'admin');
  return data;
}
```

---

## 🚦 ESTADO OPERATIVO ACTUAL

### Servicios Activos ✅
- [x] Autenticación (Email/Password)
- [x] Autenticación Anónima (Guest)
- [x] Multi-asociación
- [x] Row Level Security
- [x] Real-time Scores
- [x] Soporte de Tickets
- [x] Sistema de Rankings

### Usuarios de Prueba 🧪

Para crear usuarios de prueba en Supabase Auth:

1. Ir a **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add user**
3. Email: `test@example.com`
4. Password: `Test123!`

El perfil se crea automáticamente en `profiles` vía trigger.

---

## 📞 TROUBLESHOOTING

### Error: "NEXT_PUBLIC_SUPABASE_URL está undefined"
```
❌ Solución: Verificar .env.local, restart dev server (npm run dev)
```

### Error: "No matching RLS policy"
```
❌ Problema: La política RLS no permite la operación
✅ Solución: 
  1. Verificar auth.uid() coincide con id en BD
  2. Verificar role: 'admin'
  3. Revisar RLS policies en Supabase Dashboard
```

### Error: "Scores no se actualizan en tiempo real"
```
❌ Problema: Real-time no está habilitado
✅ Solución:
  - En Supabase: SQL Editor
  - Ejecutar: ALTER PUBLICATION supabase_realtime ADD TABLE scores;
```

### Error: "Error de conexión al login"
```
❌ Problema: Credenciales inválidas o sesión expirada
✅ Solución:
  - Limpiar cookies/localStorage
  - Verificar SUPABASE_ANON_KEY en .env.local
  - Comprobar que usuario existe en auth.users
```

---

## 🔗 REFERENCIAS ÚTILES

### Dashboard Supabase
```
https://app.supabase.com/project/[project-ref]/editor
```

### SQL Editor
- Crear/actualizar tablas
- Ejecutar migraciones
- Ver datos

### Authentication
- Usuarios: `Authentication` → `Users`
- Email confirmación: `Authentication` → `Email Templates`

### Realtime
- Habilitación: `Database` → `Publication` → `supabase_realtime`
- Tablas: `profiles`, `scores`, `games` (configuradas)

---

## 📌 SIGUIENTE PASO RECOMENDADO

Con la BD completamente configurada, el siguiente paso es:

1. **Crear usuario de prueba:** `test@example.com` en Auth
2. **Usar Setup Admins:** Ejecutar script para agregar datos iniciales
3. **Probar Login:** Verificar en `/login`
4. **Verificar Dashboard:** Acceder a `/dashboard`

---

**Documentación completa de Supabase: FootGolf Total**  
Mantener este documento actualizado cuando se agreguen nuevas tablas o cambios en RLS.
