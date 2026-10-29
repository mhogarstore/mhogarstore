// POST /api/cancel-checkout  { session: 'cs_…' }
// Cuando el cliente vuelve sin pagar, cerramos la sesión para liberar las piezas al momento
// (Stripe avisa con checkout.session.expired y el webhook las libera).
import { getStripe } from "./_shared/clients.mjs";
import { json } from "./_shared/shop.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido." });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Petición no válida." }); }
  const id = String(body?.session || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json(400, { error: "Sesión no válida." });

  try {
    const stripe = getStripe();
    const s = await stripe.checkout.sessions.retrieve(id);
    if (s.status === "open") await stripe.checkout.sessions.expire(id);
    return json(200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(200, { ok: false });  // la reserva caduca sola en 35 minutos
  }
};
