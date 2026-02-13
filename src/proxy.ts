import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * PROXY PROFESIONAL - Gestion de sesion y refresh de tokens
 *
 * Proposito: Interceptar TODAS las requests para:
 * 1. Validar y refrescar tokens JWT si estan proximos a expirar
 * 2. Sincronizar sesion entre cliente y servidor
 * 3. Evitar redirect loops mediante politica de "una sola redireccion"
 */

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // Validar y refrescar la sesion
    const { data: { user } } = await supabase.auth.getUser();

    // Rutas publicas (sin proteccion)
    const publicRoutes = ['/login', '/signup', '/info', '/reset-password', '/update-password', '/api'];
    const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route));

    // Ruta raiz (siempre redirige al dashboard)
    if (request.nextUrl.pathname === '/') {
      if (user) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } else {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }

    // Si no hay usuario y la ruta NO es publica -> redirigir a login
    if (!user && !isPublicRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Si hay usuario y esta en login/signup -> redirigir a dashboard
    if (user && (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup'))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Continuar normalmente con la sesion validada
    return response;
  } catch (error) {
    console.error('Proxy error:', error);
    // En caso de error, permitir la request (la pagina client-side lo maneja)
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
