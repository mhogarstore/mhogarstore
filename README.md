# mhogarstore · tienda online

Web de mhogarstore, tienda de muebles y objetos de segunda mano. Cada pieza es única: cuando alguien la paga, se marca como vendida sola.

## Cómo está hecha

| Parte | Qué hace | Dónde vive |
|---|---|---|
| Web (`public/index.html`) | Catálogo, fichas, cesta | Netlify |
| Panel (`public/admin/`) | La clienta sube piezas y fotos y ve pedidos | Netlify, en `/admin/` |
| Funciones (`netlify/functions/`) | Reservan las piezas, crean el pago y reciben la confirmación de Stripe | Netlify |
| Base de datos (`supabase/schema.sql`) | Piezas, fotos, pedidos y correos | Supabase |
| Pagos | Tarjeta, Apple Pay y Google Pay | Stripe Checkout |

Flujo de una compra:

1. El cliente pulsa **Pagar ahora**. `/api/checkout` comprueba que las piezas siguen libres, las **reserva 35 minutos** y crea el pedido con los precios de la base de datos.
2. El cliente paga en la página segura de Stripe.
3. Stripe avisa a `/api/stripe-webhook`. El pedido pasa a **pagado** y las piezas a **vendidas**.
4. Si el cliente no paga o vuelve atrás, las piezas se liberan.

Sin Supabase configurado, la web funciona en **modo demostración** con piezas de ejemplo.

---

## Puesta en marcha, paso a paso

Todas las cuentas deben estar **a nombre de la clienta**.

> **Claves secretas.** La clave `service_role` de Supabase y las claves `sk_…` y `whsec_…` de Stripe no se pegan en ningún chat ni correo. Se escriben solo en Netlify (paso 4).

### 1. GitHub

1. Crear una cuenta en github.com, si no la hay.
2. Crear un repositorio **privado** y vacío llamado `mhogarstore`.
3. Avisar para subir el código.

### 2. Supabase (base de datos)

1. En supabase.com, crear un proyecto llamado `mhogarstore`, en la región **Europe (Frankfurt o Paris)**. Guardar la contraseña de la base de datos en un sitio seguro.
2. Ir a **SQL Editor → New query**, pegar `supabase/schema.sql` y pulsar **Run**.
3. En otra consulta, poner el correo de la clienta y pulsar Run:
   ```sql
   insert into admins (email) values ('correo-de-la-clienta@ejemplo.com');
   ```
4. Opcional, para probar: ejecutar `supabase/seed-ejemplo.sql`.
5. Ir a **Authentication → Users → Add user → Create new user**: el mismo correo y una contraseña. Con esto entra al panel.
6. Ir a **Authentication → URL Configuration**:
   - Site URL: `https://mhogarstore.com` (o el dominio que sea).
   - Redirect URLs: añadir `https://mhogarstore.com/admin/`.
7. Ir a **Project Settings → API** y apuntar:
   - **Project URL** y clave **anon public**. Estas sí se pueden compartir: van en `public/config.js`.
   - Clave **service_role**. Es secreta y solo va en Netlify.

### 3. Stripe (pagos)

1. Crear la cuenta en stripe.com. Para empezar **no hace falta activarla**: se trabaja en *modo de prueba*.
2. Ir a **Developers → API keys** y copiar la *Secret key* de prueba (`sk_test_…`). Es para Netlify.
3. En **Settings → Payment methods**, activar tarjeta, Apple Pay y Google Pay.
4. En **Settings → Customer emails**, activar *Successful payments* para que el cliente reciba el recibo.
5. El webhook se configura después del paso 4, cuando ya hay dirección web:
   - **Developers → Webhooks → Add endpoint**
   - URL: `https://<dirección-de-la-web>/api/stripe-webhook`
   - Eventos: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - Copiar el **Signing secret** (`whsec_…`) para Netlify.

### 4. Netlify (publicar la web)

1. En netlify.com, entrar con la cuenta de GitHub y elegir **Add new site → Import from GitHub → mhogarstore**. La configuración se lee sola de `netlify.toml`.
2. En **Site configuration → Environment variables**, añadir:

   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | Project URL de Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave service_role |
   | `STRIPE_SECRET_KEY` | `sk_test_…` (luego `sk_live_…`) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
   | `SITE_URL` | `https://mhogarstore.com` |
   | `SHIP_COST_CENTS` | `2500` (25 €) |
   | `SHIP_FREE_FROM_CENTS` | `8000` (80 €) |

3. Pulsar **Deploys → Trigger deploy**.

### 5. Dominio

La clienta ya tiene el dominio. No hace falta moverlo, solo apuntarlo a Netlify:

1. En Netlify, ir a **Domain management → Add a domain** y escribir el dominio.
2. En el panel DNS del proveedor donde se compró el dominio:
   - Registro **A**, nombre `@`, valor `75.2.60.5`.
   - Registro **CNAME**, nombre `www`, valor `<nombre-del-sitio>.netlify.app`.
   - **No tocar** los registros MX ni los demás registros de correo.
3. En unas horas Netlify activa el candado (HTTPS) por su cuenta.

Netlify muestra en ese momento los valores exactos que pide. Si no coinciden con estos, valen los de Netlify.

### 6. Probar una compra

Con las claves de prueba, en la web:

- Tarjeta `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC.
- Comprobar que la pieza aparece como **Vendida** y que el pedido sale en **Panel → Pedidos**.

### 7. Empezar a vender de verdad

1. Activar la cuenta de Stripe con los datos fiscales y el IBAN de la clienta.
2. Cambiar `STRIPE_SECRET_KEY` por la clave `sk_live_…`.
3. Crear el mismo webhook en modo real y cambiar `STRIPE_WEBHOOK_SECRET`.
4. Borrar las piezas de ejemplo:
   ```sql
   delete from items where description like '[Ejemplo]%';
   ```

---

## Antes de abrir al público

- **Textos legales**: aviso legal, política de privacidad, cookies, y condiciones de venta con el **derecho de desistimiento de 14 días**, obligatorio en ventas online a particulares. Hacen falta el nombre fiscal, el NIF y la dirección de la clienta.
- **IVA**: preguntar a su gestor si aplica el **REBU** (régimen de bienes usados).
- **Datos reales** en `public/index.html`: dirección, horario, teléfono, correo y el número de WhatsApp en `public/config.js`.
- **Bizum**: Stripe no lo ofrece. Por ahora el botón «¿Prefieres Bizum?» lleva el pedido a WhatsApp. Más adelante se puede añadir el TPV virtual del banco (Redsys).

## Para desarrollo

```bash
npm install
npm test            # pruebas del flujo de pago (no necesitan cuentas)
cp .env.example .env && npx netlify-cli dev   # web + funciones en http://localhost:8888
```
