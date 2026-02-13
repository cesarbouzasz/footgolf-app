import { supabase } from '@/lib/supabase';

/**
 * Guarda la asociación por defecto para el usuario
 */
export const setDefaultAssociation = async (userId: string, associationId: string | null): Promise<{ error: any | null }> => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ default_association_id: associationId })
      .eq('id', userId);

    if (error) {
      console.error('Error updating default association:', error);
      return { error };
    }

    return { error: null };
  } catch (err) {
    console.error('Error:', err);
    return { error: err };
  }
};

/**
 * Obtiene todas las asociaciones para un usuario
 */
export const getUserAssociations = async (userId: string) => {
  try {
    // Si el usuario es admin, obtiene su asociación
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('association_id, role')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    // Si es admin, devolver solo su asociación
    if (profile?.role === 'admin' && profile?.association_id) {
      const { data, error } = await supabase
        .from('associations')
        .select('id, name')
        .eq('id', profile.association_id);
      
      return { data: data || [], error };
    }

    // Si es usuario regular, devolver todas las asociaciones
    const { data, error } = await supabase
      .from('associations')
      .select('id, name')
      .order('name', { ascending: true });

    return { data: data || [], error };
  } catch (err) {
    console.error('Error getting user associations:', err);
    return { data: [], error: err };
  }
};
