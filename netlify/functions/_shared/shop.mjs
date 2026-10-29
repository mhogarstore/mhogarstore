// Lógica común de la tienda, sin dependencias externas, para poder probarla aislada.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ITEMS = 20;
export const RESERVE_MINUTES = 35;   // un poco más que la sesión de Stripe (30 min)
export const SESSION_MINUTES = 30;   // mínimo que permite Stripe

export function shippingConfig(env = process.env) {
  return {
    cost: int(env.SHIP_COST_CENTS, 2500),
    freeFrom: int(env.SHIP_FREE_FROM_CENTS, 8000)
  };
}

function int(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Valida el cuerpo que manda la web: { items: [uuid…], delivery: 'recogida' | 'envio' }
export function parseCheckoutBody(body) {
  if (!body || typeof body !== "object") return { error: "Petición vacía." };
  const ids = Array.isArray(body.items) ? [...new Set(body.items.map(String))] : [];
  if (!ids.length) return { error: "La cesta está vacía." };
  if (ids.length > MAX_ITEMS) return { error: `Como máximo ${MAX_ITEMS} piezas por pedido.` };
  if (!ids.every((id) => UUID.test(id))) return { error: "Hay una pieza no válida en la cesta." };
  const delivery = body.delivery === "envio" ? "envio" : "recogida";
  return { ids, delivery };
}

// Calcula el pedido SIEMPRE con los precios de la base de datos, nunca con los del navegador.
export function computeTotals(items, delivery, ship = shippingConfig()) {
  const subtotal = items.reduce((s, it) => s + it.price_cents, 0);
  const shipping = delivery === "envio" && subtotal < ship.freeFrom ? ship.cost : 0;
  return { subtotal, shipping, total: subtotal + shipping };
}

export function siteUrl(env = process.env) {
  return (env.SITE_URL || env.URL || "http://localhost:8888").replace(/\/+$/, "");
}

// Parámetros de la sesión de Stripe Checkout.
export function buildSessionParams({ order, items, delivery, totals, site, now = Date.now() }) {
  const params = {
    mode: "payment",
    locale: "es",
    currency: "eur",
    client_reference_id: order.id,
    metadata: { order_id: order.id, order_number: String(order.number) },
    payment_intent_data: { metadata: { order_id: order.id, order_number: String(order.number) } },
    line_items: items.map((it) => ({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: it.price_cents,
        product_data: { name: `${it.title} · Ref. ${it.ref}` }
      }
    })),
    phone_number_collection: { enabled: true },
    expires_at: Math.floor(now / 1000) + SESSION_MINUTES * 60,
    success_url: `${site}/gracias.html?pedido=${order.number}`,
    cancel_url: `${site}/?pago=cancelado&s={CHECKOUT_SESSION_ID}`
  };
  if (delivery === "envio") {
    params.shipping_address_collection = { allowed_countries: ["ES"] };
    params.shipping_options = [{
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: totals.shipping ? "Envío a domicilio" : "Envío a domicilio gratis",
        fixed_amount: { amount: totals.shipping, currency: "eur" }
      }
    }];
  }
  return params;
}

export function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
