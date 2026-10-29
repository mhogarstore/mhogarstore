// Configuración pública de la web. Estas claves PUEDEN estar en el navegador:
// la clave "anon" de Supabase solo deja leer el catálogo y apuntarse a avisos.
// Si supabaseUrl está vacío, la web muestra las piezas de ejemplo (modo demostración).
window.MHOGAR = {
  supabaseUrl: "",          // Supabase → Project Settings → API → Project URL
  supabaseAnonKey: "",      // Supabase → Project Settings → API → anon public
  whatsapp: "34600000000",  // número con prefijo de país, sin espacios ni +
  shipCost: 25,             // € de envío a domicilio (igual que SHIP_COST_CENTS / 100)
  shipFreeFrom: 80          // € a partir de los que el envío es gratis (igual que SHIP_FREE_FROM_CENTS / 100)
};
