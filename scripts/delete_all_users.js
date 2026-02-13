require('dotenv').config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function deleteAllUsers() {
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
