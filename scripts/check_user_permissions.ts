
require('dotenv').config({ path: '../.env.local' });
import { createClient } from '../src/lib/supabase';

console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const supabase = createClient();

async function checkUserPermissions(email: string) {
  // Buscar usuario por email
  const { data: user, error: userError, status, statusText } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (userError || !user) {
    console.error('Usuario no encontrado:', userError);
    console.error('Respuesta Supabase:', { user, userError, status, statusText });
    return;
  }

  console.log('Usuario:', user);

  // Comprobar permisos
  const role = user.role;
  const associationId = user.association_id;
  const defaultAssociation = user.default_association_id;

  console.log('Permisos:');
  console.log('Role:', role);
  console.log('Association ID:', associationId);
  console.log('Default Association:', defaultAssociation);

  // Puedes agregar más comprobaciones aquí
}

checkUserPermissions('marcobs2026@gmail.com').catch((err) => {
  console.error('Error en ejecución:', err);
});
