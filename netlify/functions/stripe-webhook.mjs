// POST /api/stripe-webhook  (lo llama Stripe, no la web)
// Pago completado → pedido pagado y piezas vendidas.
// Sesión caducada o pago fallido → pedido cancelado y piezas liberadas.
import { getDb, getStripe } from "./_shared/clients.mjs";
import { json } from "./_shared/shop.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });

  let event;
  try {
    const raw = await req.text();
    event = getStripe().webhooks.constructEvent(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Firma de webhook no válida:", err.message);
    return json(400, { error: "Firma no válida." });
  }

  const session = event.data.object;
  const orderId = session?.metadata?.order_id;
  if (!orderId) return json(200, { ignored: true });

  const db = getDb();
  const { data: order } = await db.from("orders").select("id, status").eq("id", orderId).single();
  if (!order) return json(200, { ignored: true });
  const { data: lines } = await db.from("order_items").select("item_id").eq("order_id", orderId);
  const ids = (lines || []).map((l) => l.item_id);

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      if (session.payment_status !== "paid" || order.status === "pagado") break;
      const c = session.customer_details || {};
      const ship = session.collected_information?.shipping_details || session.shipping_details || null;
      await db.from("orders").update({
        status: "pagado",
        paid_at: new Date().toISOString(),
        customer_name: ship?.name || c.name || null,
        customer_email: c.email || null,
        customer_phone: c.phone || null,
        shipping_address: ship?.address || null,
        stripe_payment_id: typeof session.payment_intent === "string" ? session.payment_intent : null
      }).eq("id", orderId);
      await db.rpc("mark_items_sold", { item_ids: ids });
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      if (order.status !== "pendiente") break;
      await db.from("orders").update({ status: "cancelado" }).eq("id", orderId);
      await db.rpc("release_items", { item_ids: ids });
      break;
    }
  }
  return json(200, { received: true });
};
