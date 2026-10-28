// Conexión con Supabase (la base de datos donde viven tus obras y los mensajes de contacto).
// Esta clave es "publicable": está pensada para ir en la web y solo permite lo que las reglas de la base permiten
// (ver obras publicadas y enviar mensajes). Nunca pongas aquí la clave "secret" o "service_role".
window.LLONE_CONFIG = {
  supabaseUrl: 'https://febljmymxgbyilbmolkc.supabase.co',
  supabaseKey: 'sb_publishable_tYCyv1Nd9wWrvj4HmLymTQ_zsUDVrWZ',
};
