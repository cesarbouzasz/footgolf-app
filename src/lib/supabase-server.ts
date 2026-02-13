import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * SUPABASE SERVER CLIENT - Para Server Components
 * 
 * Uso en Server Components:
 * 
 * const supabase = await createServerClient();
 * const { data: { user } } = await supabase.auth.getUser();
 * 
 * ⚠️ IMPORTANTE: Usar getUser() (valida JWT) en lugar de getSession() 
 * que puede ser suplantada en el cliente.
 */

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

/**
 * Helper para páginas protegidas
 * 
 * Uso:
 * const { user, profile } = await protectedRoute();
 * 
 * Si no está autenticado, redirige automáticamente a /login
 */

export async function protectedRoute() {
  const supabase = await createServerClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (!user || error) {
    redirect('/login');
  }

  // Obtener perfil del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { user, profile };
}

/**
 * Helper para rutas admin
 * 
 * Uso:
 * const { user, profile } = await adminRoute();
 * 
 * Si no es admin, redirige a /dashboard
 */

export async function adminRoute() {
  const { user, profile } = await protectedRoute();

  if (profile?.role !== 'admin' && profile?.role !== 'creador') {
    redirect('/dashboard');
  }

  return { user, profile };
}
