import { supabase } from '@/lib/supabase';

/**
 * Obtiene el ID de la asociación del admin
 */
export const getAdminAssociationId = async (userId: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('association_id')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('Error getting admin association:', error);
      return null;
    }
    return data?.association_id || null;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
};

/**
 * Obtiene todos los torneos de una asociación
 */
export const getTournamentsForAdmin = async (associationId: string) => {
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('association_id', associationId)
      .order('start_date', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error getting tournaments:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene todos los campos de una asociación
 */
export const getCoursesForAdmin = async (associationId: string) => {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('association_id', associationId)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error getting courses:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene todos los jugadores de una asociación
 */
export const getPlayersForAdmin = async (associationId: string) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('association_id', associationId)
      .order('first_name', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error getting players:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene todas las clasificaciones de una asociación
 */
export const getRankingsForAdmin = async (associationId: string) => {
  try {
    const { data, error } = await supabase
      .from('rankings')
      .select(`
        *,
        profiles:player_id(first_name, last_name),
        tournaments:tournament_id(name)
      `)
      .eq('association_id', associationId)
      .order('position', { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error getting rankings:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene todas las noticias de una asociación
 */
export const getNewsForAdmin = async (associationId: string) => {
  try {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('association_id', associationId)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error getting news:', error);
    return { data: null, error };
  }
};

/**
 * Obtiene información de la asociación
 */
export const getAssociationInfo = async (associationId: string) => {
  try {
    const { data, error } = await supabase
      .from('associations')
      .select('*')
      .eq('id', associationId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error getting association info:', error);
    return { data: null, error };
  }
};

/**
 * Crea un nuevo torneo para la asociación
 */
export const createTournament = async (
  associationId: string,
  tournamentData: any
) => {
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .insert([
        {
          association_id: associationId,
          ...tournamentData,
        },
      ])
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating tournament:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza un torneo
 */
export const updateTournament = async (
  tournamentId: string,
  tournamentData: any
) => {
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .update(tournamentData)
      .eq('id', tournamentId)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating tournament:', error);
    return { data: null, error };
  }
};

/**
 * Elimina un torneo
 */
export const deleteTournament = async (tournamentId: string) => {
  try {
    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting tournament:', error);
    return { error };
  }
};

/**
 * Crea una nueva noticia
 */
export const createNews = async (associationId: string, newsData: any) => {
  try {
    const { data, error } = await supabase
      .from('news')
      .insert([
        {
          association_id: associationId,
          ...newsData,
        },
      ])
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating news:', error);
    return { data: null, error };
  }
};

/**
 * Actualiza una noticia
 */
export const updateNews = async (newsId: string, newsData: any) => {
  try {
    const { data, error } = await supabase
      .from('news')
      .update(newsData)
      .eq('id', newsId)
      .select();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating news:', error);
    return { data: null, error };
  }
};

/**
 * Elimina una noticia
 */
export const deleteNews = async (newsId: string) => {
  try {
    const { error } = await supabase
      .from('news')
      .delete()
      .eq('id', newsId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting news:', error);
    return { error };
  }
};
