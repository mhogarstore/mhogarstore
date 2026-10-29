-- Piezas de EJEMPLO para probar la tienda antes de cargar las reales.
-- Opcional. Para borrarlas después: delete from items where description like '[Ejemplo]%';

insert into items (title, category_id, price_cents, was_price_cents, condition, dimensions, material, era, description, status) values
  ('Aparador de teca de tres puertas', 'muebles', 42000, null, 'muy', 'an 180 × fo 45 × al 78 cm', 'Teca y chapa de teca', 'Años 60', '[Ejemplo] Aparador escandinavo con tiradores tallados en la propia madera. Interior con balda regulable.', 'disponible'),
  ('Lámpara de pie de latón', 'iluminacion', 13500, null, 'muy', 'al 160 cm · Ø pantalla 38 cm', 'Latón y lino', 'Años 70', '[Ejemplo] Pantalla de lino nueva y cableado revisado. Casquillo E27.', 'disponible'),
  ('Silla de bistró de madera curvada', 'muebles', 6500, 8500, 'bueno', 'an 42 × fo 50 × al 86 cm · asiento a 46 cm', 'Haya curvada y rejilla', 'Años 50', '[Ejemplo] Rejilla del asiento rehecha a mano. Marcas de uso en las patas.', 'disponible'),
  ('Jarrón de cerámica esmaltada', 'decoracion', 3800, null, 'nuevo', 'al 32 × Ø 18 cm', 'Cerámica de Manises', 'Años 80', '[Ejemplo] Esmalte verde con chorreado irregular. Sin desconchones.', 'disponible'),
  ('Butaca tapizada en bouclé', 'muebles', 29000, null, 'muy', 'an 78 × fo 74 × al 72 cm', 'Pino, tapizado nuevo', 'Años 60', '[Ejemplo] Retapizada en bouclé crudo con espuma nueva.', 'disponible'),
  ('Juego de café de porcelana', 'menaje', 4500, null, 'muy', '6 tazas, 6 platos, cafetera, azucarero', 'Porcelana', 'Años 60', '[Ejemplo] Completo. Una taza con un pequeño desgaste en el filo dorado.', 'disponible'),
  ('Manta de lana a cuadros', 'textil', 4200, null, 'muy', '130 × 180 cm', 'Lana virgen', 'Años 70', '[Ejemplo] Lavada en seco. Flecos en los dos extremos.', 'disponible'),
  ('Mesa de comedor de roble', 'muebles', 38000, null, 'bueno', 'an 160 × fo 85 × al 75 cm', 'Roble macizo', 'Años 50', '[Ejemplo] Caben seis personas. Tablero barnizado al agua.', 'vendido');

update items set sold_at = now() where status = 'vendido' and sold_at is null;
