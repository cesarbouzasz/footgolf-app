'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  email?: string | null;
  first_name: string | null;
  last_name: string | null;
  handicap: number;
  role: 'admin' | 'creador' | 'avanzado' | 'usuario' | 'guest';
  association_id?: string | null;
  default_association_id?: string | null;
  chatbot_enabled?: boolean | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isAdvanced: boolean;
  isGuest: boolean;
  isAuthenticated: boolean;
  currentAssociationId: string | null;
  setCurrentAssociationId: (id: string | null) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeAssociationKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const extractAdminSuffix = (handle: string) => {
  const cleaned = handle.trim().toLowerCase();
  if (!cleaned.startsWith('admin')) return '';
  return cleaned.slice(5).trim();
};

const getUserHandle = (sessionUser: User | null | undefined) => {
  const meta = (sessionUser?.user_metadata || {}) as Record<string, unknown>;
  const fromMeta = String(meta.username || meta.user_name || meta.userName || '').trim();
  if (fromMeta) return fromMeta;
  const email = String(sessionUser?.email || '').trim();
  return email.includes('@') ? email.split('@')[0] : email;
};

const resolveAssociationIdFromHandle = async (handle: string) => {
  const suffix = extractAdminSuffix(handle);
  if (!suffix) return null;

  try {
    const res = await fetch('/api/associations');
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const targetKey = normalizeAssociationKey(suffix);
    const match = rows.find((row: any) => normalizeAssociationKey(String(row?.name || '')) === targetKey);
    return match?.id ? String(match.id) : null;
  } catch {
    return null;
  }
};

/**
 * PROFESSIONAL AUTH PROVIDER
 * 
 * Patrón Birdiebase-style con protecciones contra bucles:
 * - Token refresh manejado por middleware
 * - Estado sincronizado con onAuthStateChange
 * - Single sign-out point
 * - No redirect loops porque el middleware controla acceso
 */

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentAssociationId, setCurrentAssociationId] = useState<string | null>(null);
  const router = useRouter();

  /**
   * Cargar perfil del usuario desde BD
   */
  const loadProfile = useCallback(async (userId: string, isAnonymous?: boolean) => {
    // Skip para usuarios anónimos - no tienen perfil en BD
    if (isAnonymous) {
      setProfile(null);
      return;
    }

    try {
      // Usar endpoint server-side con service_role para evitar errores por RLS/policies.
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const sessionEmail = (sessionRes?.data?.session?.user?.email || '').trim().toLowerCase();

      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const res = await fetch('/api/profile/me', {
        method: 'GET',
        headers,
      });
      const json = await res.json().catch(() => null);
      const data = json?.profile ?? null;

      if (!data || data.id !== userId) {
        setProfile(null);
        setCurrentAssociationId(null);
        return;
      }

      // Bootstrap admin (solo para el email configurado) si el rol quedó mal.
      const currentEmail = sessionEmail;
      const roleRaw = (data as any)?.role;
      const normalizedRole = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';

      const allowedBootstrapEmail = (process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || 'mbs2026@gmail.com').trim().toLowerCase();

      if (currentEmail === allowedBootstrapEmail && normalizedRole !== 'creador') {
        await fetch('/api/profile/bootstrap-admin', { method: 'POST', headers }).catch(() => null);
        const res2 = await fetch('/api/profile/me', { method: 'GET', headers });
        const json2 = await res2.json().catch(() => null);
        const data2 = json2?.profile ?? null;
        if (data2 && data2.id === userId) {
          setProfile(data2 as UserProfile);
          if (data2.default_association_id) {
            setCurrentAssociationId(data2.default_association_id);
          } else if (data2.association_id) {
            setCurrentAssociationId(data2.association_id);
          }
          return;
        }
      }

      setProfile(data as UserProfile);
      if (data.default_association_id) {
        setCurrentAssociationId(data.default_association_id);
      } else if (data.association_id) {
        setCurrentAssociationId(data.association_id);
      } else {
        const roleRaw = (data as any)?.role;
        const normalizedRole = typeof roleRaw === 'string' ? roleRaw.trim().toLowerCase() : '';
        if (normalizedRole === 'admin') {
          const sessionUser = sessionRes?.data?.session?.user || null;
          const handle = getUserHandle(sessionUser);
          const derivedAssociationId = await resolveAssociationIdFromHandle(handle);
          if (derivedAssociationId) setCurrentAssociationId(derivedAssociationId);
        }
      }
    } catch (err) {
      console.error('Error cargando perfil:', err);
      setProfile(null);
      setCurrentAssociationId(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const isAnon = user.user_metadata?.['is_anonymous'] === true;
    await loadProfile(user.id, isAnon);
  }, [loadProfile, user?.id, user?.user_metadata]);

  /**
   * Inicializar sesión y listeners
   * Se ejecuta UNA SOLA VEZ al montar
   */
  useEffect(() => {
    const initAuth = async () => {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 2000)),
        ]);

        const session = sessionResult?.data?.session ?? null;

        if (session?.user) {
          setUser(session.user);
          const isAnon = session.user.user_metadata?.['is_anonymous'] === true;
          void loadProfile(session.user.id, isAnon);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        console.error('Error inicializando auth:', error);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    // 2. Listeners para cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          const isAnon = session.user.user_metadata?.['is_anonymous'] === true;
          void loadProfile(session.user.id, isAnon);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    // 3. Ejecutar inicialización
    initAuth();

    // 4. Cleanup
    return () => subscription?.unsubscribe();
  }, [loadProfile]);

  /**
   * Sign Out - centralizado
   * Limpia el estado local primero, luego intenta signOut de Supabase
   */
  const signOut = useCallback(async () => {
    try {
      // 1. Limpiar estado local inmediatamente
      setUser(null);
      setProfile(null);
      setCurrentAssociationId(null);
      
      // 2. Intentar sign out de Supabase (sin esperar si falla)
      try {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
      } catch (supabaseError) {
        console.warn('Supabase signOut falló, pero estado local limpio:', supabaseError);
        // No lanzar error, continuar de todas formas
      }
    } catch (error) {
      console.error('Error en sign out:', error);
      // Limpiar de todas formas
      setUser(null);
      setProfile(null);
      setCurrentAssociationId(null);
    }
  }, []);

  /**
   * Sign In - email + contraseña
   */
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { error };
      }

      if (data.user) {
        setUser(data.user);
        await loadProfile(data.user.id);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  }, [loadProfile]);

  /**
   * Sign Up - registro
   */
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        return { error };
      }

      // NO establecer usuario aquí; esperar confirmación
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  }, []);

  const value: AuthContextType = {
    user,
    profile,
    loading,
    isAdmin: (() => {
      const role = (profile as any)?.role;
      const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
      return normalized === 'admin' || normalized === 'creador';
    })(),
    isAdvanced: (() => {
      const role = (profile as any)?.role;
      const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
      return normalized === 'avanzado';
    })(),
    isGuest: (() => {
      const anon = (user as any)?.is_anonymous === true || user?.user_metadata?.['is_anonymous'] === true;
      const role = (profile as any)?.role;
      const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
      return anon || normalized === 'guest';
    })(),
    isAuthenticated: !!user,
    currentAssociationId,
    setCurrentAssociationId,
    refreshProfile,
    signOut,
    signIn,
    signUp,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * HOOK para acceder al contexto
 * Uso: const { user, profile, isAdmin } = useAuth();
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};