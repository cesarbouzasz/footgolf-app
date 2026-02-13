export type EventCategory = 'local' | 'regional' | 'nacional' | 'major' | 'especial';

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  local: '#86efac',    // Verde
  regional: '#7dd3fc', // Azul
  nacional: '#fca5a5', // Rojo
  major: '#fcd34d',    // Amarillo
  especial: '#cbd5e1'  // Gris
};

export interface TournamentEvent {
  id: string;
  name: string;
  date: string;
  category: EventCategory;
  location: string;
  is_official: boolean; // TRUE: Inscripción activa | FALSE: Solo informativo
}

// Nuevos tipos para modelo multi-asociación

export interface Association {
  id: string;
  name: string;
  admin_id: string;
  location?: string;
  logo_url?: string;
  created_at: string;
}

export interface Tournament {
  id: string;
  association_id: string;
  name: string;
  start_date: string;
  end_date?: string;
  format: 'stroke' | 'match' | 'stableford';
  location: string;
  category: 'Absoluta' | 'Hombres' | 'Senior' | 'Senior+' | 'Mujeres' | 'Juniors';
  is_official: boolean;
  created_at: string;
}

export interface Course {
  id: string;
  association_id: string;
  name: string;
  location: string;
  pars: number[];
  distances: number[];
  hole_info?: Record<string, any>;
  created_at: string;
}

export interface News {
  id: string;
  association_id: string;
  title: string;
  content: string;
  image_url?: string;
  published_at: string;
  created_at: string;
}

export interface Ranking {
  id: string;
  association_id: string;
  tournament_id?: string;
  player_id: string;
  position: number;
  total_strokes: number;
  vs_par_score: string;
  holes_played: number;
  created_at: string;
}

export interface PlayerProfile {
  id: string;
  first_name: string;
  last_name: string;
  handicap: number;
  role: 'creador' | 'admin' | 'avanzado' | 'usuario' | 'guest';
  association_id?: string;
  created_at: string;
}