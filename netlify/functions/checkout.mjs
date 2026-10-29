// POST /api/checkout  { items: [id…], delivery: 'recogida' | 'envio' }
// Reserva las piezas, crea el pedido y devuelve la dirección de pago de Stripe.
import { getDb, getStripe } from "./_shared/clients.mjs";
import { parseCheckoutBody, computeTotals, buildSessionParams, siteUrl, json, RESERVE_MINUTES } from "./_shared/shop.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Petición no válida." }); }
  const parsed = parseCheckoutBody(body);
  if (parsed.error) return json(400, { error: parsed.error });
  const { ids, delivery } = parsed;

  const db = getDb();

  // 1. Reservar todas las piezas o ninguna.
  const { data: items, error: resErr } = await db.rpc("reserve_items", { item_ids: ids, minutes: RESERVE_MINUTES });
  if (resErr) { console.error(resErr); return json(500, { error: "No hemos podido preparar el pago. Inténtalo de nuevo." }); }
  if (!items || items.length !== ids.length) {
    const { data: rows } = await db.from("items").select("id, status, reserved_until").in("id", ids);
    const now = Date.now();
    const unavailable = ids.filter((id) => {
      const r = (rows || []).find((x) => x.id === id);
      return !r || r.status === "vendido" || r.status === "borrador" ||
        (r.status === "reservado" && new Date(r.reserved_until).getTime() > now);
    });
    return json(409, { error: "Alguna pieza de tu cesta ya no está disponible.", unavailable });
  }

  // 2. Crear el pedido con los precios de la base de datos.
  const totals = computeTotals(items, delivery);
  const { data: order, error: ordErr } = await db.from("orders").insert({
    delivery, subtotal_cents: totals.subtotal, shipping_cents: totals.shipping, total_cents: totals.total
  }).select("id, number").single();
  if (ordErr) { console.error(ordErr); await db.rpc("release_items", { item_ids: ids }); return json(500, { error: "No hemos podido crear el pedido." }); }

  await db.from("order_items").insert(items.map((it) => ({
    order_id: order.id, item_id: it.id, title: it.title, price_cents: it.price_cents
  })));

  // 3. Sesión de pago en Stripe.
  try {
    const session = await getStripe().checkout.sessions.create(
      buildSessionParams({ order, items, delivery, totals, site: siteUrl() })
    );
    await db.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return json(200, { url: session.url, order: order.number });
  } catch (err) {
    console.error(err);
    await db.rpc("release_items", { item_ids: ids });
    await db.from("orders").update({ status: "cancelado", notes: "Error al crear el pago en Stripe" }).eq("id", order.id);
    return json(502, { error: "El servicio de pago no responde. Inténtalo en unos minutos." });
  }
};
