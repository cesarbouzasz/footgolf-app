require('dotenv').config({ path: '../.env.local' });
import { createClient } from '../src/lib/supabase';

const supabase = createClient();

async function deleteAllUsers() {
  // Eliminar todos los registros de la tabla profiles
  const { error } = await supabase.from('profiles').delete().neq('id', null);
  if (error) {
    console.error('Error al borrar usuarios:', error);
  } else {
    console.log('Todos los usuarios han sido borrados.');
  }
}

deleteAllUsers().catch((err) => {
  console.error('Error en ejecución:', err);
});
